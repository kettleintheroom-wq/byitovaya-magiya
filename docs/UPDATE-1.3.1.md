# 1.3.1 — durable push navigation и компактный случайный ритуал

Только pwa-prototype. Preview:
https://pwa-prototype.byitovaya-magiya.pages.dev/
main и PR не объединяются. Новый iOS fallback требует отдельной приёмки
владельцем на физическом iPhone: браузерные тесты не доказывают исправление
в поведении конкретной версии iOS.

## Передача navigation intent

Общий push-navigation.js загружается страницей и через importScripts в SW.
Используется отдельная IndexedDB `bbm-push-navigation-v1`, store `handoff`.
Журнал, push identity и существующие настройки не мигрируются.

В notificationclick SW сначала записывает в единственный слот pending:

```js
{type:'ritual', ritualId:'coffee-cinnamon', createdAt:Date.now(), id:crypto.randomUUID()}
```

Ожидается завершение write transaction, а не только успешный put. Следующий
tap заменяет pending. Только затем выполняются best-effort navigate, focus и
OPEN_RITUAL. При отсутствии окна остаётся openWindow с прежним deep-link.
Если IndexedDB недоступен, старые быстрые пути всё равно выполняются.

Страница запускает consumePendingPushNavigation при старте, pageshow,
возвращении visibilityState=visible, window focus и OPEN_RITUAL. Есть также
foreground-проверка раз в две секунды: она подхватывает commit, пришедший уже
после события resume, или при отсутствии нового focus у видимого окна iOS.
В фоне/pagehide эта проверка останавливается. Сеть не используется.

TTL — пять минут от нажатия. Проверяются type, ID, ritualId, timestamp и
наличие ритуала в каталоге. Просроченные/невалидные записи удаляются.
Перед открытием TTL проверяется ещё раз на случай паузы во время чтения.

Переход применяет UI напрямую: закрывает вспомогательные dialogs, обновляет
hash через history.replaceState, открывает/переключает detail и фокусирует
заголовок. Он не ждёт hashchange. Уже открытый target не создаёт новый dialog.
Только после фактического открытия выполняется complete: удаляется pending
с совпадающим ID, а обработанный ID сохраняется как короткий tombstone.
Повторная доставка этого ID игнорируется и после перезагрузки страницы.

Хранятся один pending target и максимум 32 недавних обработанных ID без
ритуалов/подписки/секретов. Single-flight и Set защищают от одновременных
lifecycle-вызовов и повторного UI при временной ошибке подтверждения.
Позднее подтверждение старого intent не удаляет более новый pending.

Это локальная задача: D1, VAPID, PushSubscription, Worker API, Cron и
расписания не менялись. LocalStorage в handoff не используется.

## Случайный ритуал

CTA — компактная чёрная кнопка с прежними подписями. После выбора показывается
отдельный random-result: иконка 21 px, название, метаданные, short description
до трёх строк и chevron. Весь результат — один доступный с клавиатуры button,
открывающий detail. Большой ritual-card, сердечко и «Поколдовано» из preview
удалены. Действия остаются внутри detail. Внешнего тяжёлого контейнера нет.

pickRandom и правила даты/фазы/контекста не изменены. Соседние результаты не
повторяются. На 390 px проверена высота всего блока с CTA меньше 300 px в обоих
режимах текста; фактический короткий результат занимает около 230–250 px.

## Проверки

- tests/push-navigation.cjs — реальный общий IndexedDB страницы и SW, исполнение
  notificationclick с намеренно потерянными эффектами navigate/postMessage.
  Проверены visible/focus/pageshow/start/message/poll, другой/тот же ритуал,
  закрытие формы, TTL, неизвестный id, повтор уже consumed после reload,
  single-flight, замена pending, порядок ack и retry, offline/cold start,
  отказ IndexedDB и сохранность журнала.
- В том же тесте compact random проверен на 320/375/390/430/1280 px с обычным
  и увеличенным текстом, без controls общей карточки, с открытием detail и
  без соседних повторов.
- Регрессии push-ui, features, smoke, iOS navigationResponse, model, storage,
  content, release-config и существующие 17 серверных тестов сохранены.
- Upgrade-state использует fixture 1.3.0: обновление через waiting SW,
  журнал/избранное/push store и флаг анонса, последующее обновление и offline.
  Новый общий JS включён в precache (всего 19 ресурсов).

Пример запуска:

```sh
node tests/push-navigation.cjs
node tests/push-sw.cjs
UPGRADE_FROM=1.3.0 node tests/upgrade-state.cjs
node tests/features.cjs
node tests/push-ui.cjs
node tests/smoke.cjs
node tests/ios-navigation.cjs
npm --prefix push test
```

Для browser-тестов нужен Playwright + Chromium. Отправка через Apple Push
в этих тестах не выполняется; реальную доставку инфраструктуры владелец уже
подтвердил в 1.2.0/1.3.0. Теперь важно проверить новые сценарии B/C.

## Обновление и iPhone A/B/C

В установленной PWA: Моё → Обновления → Проверить обновление → Обновить.
Проверить версию 1.3.1 и сохранность журнала/старых напоминаний.
Не переустанавливать PWA, не очищать данные сайта, не переподписываться.
PowerShell, redeploy Worker, миграции D1 и смена VAPID для этого релиза не нужны.

Для каждого случая поставить отдельное once-напоминание на ближайшее будущее.
Доставка проверяется существующим Cron (шаг до пяти минут), а не новым API.

- A. Полностью закрыть PWA → дождаться push → tap → нужный ритуал.
- B. Оставить PWA открытой и видимой на «Моё» → push → tap → нужный ритуал.
- C. Открыть PWA, отправить в background → push → tap → нужный ритуал.

В B/C переход должен примениться сразу при resume или ближайшей локальной
проверкой в течение примерно двух секунд. Проверить один detail без второго
окна, переход с другого ритуала и повторный tap на уже открытом target.

## Файлы

Клиент: push-navigation.js (новый), sw.js, app.js, push-ui.js, index.html, app.css.
push/scripts/setup-preview.mjs — только добавлен новый клиентский JS в Pages
allowlist на будущее; этот setup не запускался и Worker не деплоился.
Документация: README.md и этот файл.
Тесты: tests/push-navigation.cjs (новый), tests/push-sw.cjs, tests/features.cjs,
tests/smoke.cjs, tests/upgrade-state.cjs; snapshot fixtures/v1.3.0 из коммита
2c7743570a029c8ec7be6a6645f0874440aac219 (index.html, app.js, model.js, sw.js,
push-ui.js).
