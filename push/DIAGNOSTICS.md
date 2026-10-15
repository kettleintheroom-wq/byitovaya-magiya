# Временная диагностика preview push

Это диагностическое изменение, а не подтверждённое исправление live-ошибки.
Не меняет клиент, VAPID-ключи, подписки, схему D1 и main.

## Уже проверено локально

- `@block65/webcrypto-web-push` 2.0.0 собирает aes128gcm/VAPID payload в workerd
  с compatibility_date 2026-10-01 как без nodejs_compat, так и с ним.
- Повторить: в папке push выполнить `node tests/runtime-probe.mjs`.
  Все ключи синтетические, сеть push-сервиса не вызывается.
- `npm test` проверяет в том числе редактирование секретов, отключение диагностики
  вне preview, скрытую ошибку /test и accepted:true при mock-ответе 201.
- Эти проверки НЕ доказывают доставку на настоящий iPhone.

## На компьютере, где проходил setup

Обновить исходники из pwa-prototype, сохранив существующие
`push/wrangler.local.json` и `push/.secrets/vapid.json`.
Не запускать первоначальный setup, не генерировать новые ключи.

Из папки проекта:

```sh
cd push
npx wrangler deploy --config wrangler.local.json
node scripts/tail-preview.mjs
```

Перед deploy проверить в wrangler.local.json:
name = byitovaya-magiya-push-preview; ENVIRONMENT = preview;
DB содержит реальный database_id, не нулевой placeholder из шаблона.
Если Wrangler не авторизован — выполнить `npx wrangler login` на этом компьютере.

Tail выводит только помеченные очищенные сообщения приложения, а не request
headers, полную подписку или необработанный JSON события Cloudflare.
Для проверки версий без секретных значений отдельно доступны:

```sh
npx wrangler deployments status --config wrangler.local.json --json
npx wrangler secret list --config wrangler.local.json
```

Наличие имён в secret list не доказывает наличие значений в обслужившей запрос
версии. `test.config` выводит только boolean наличия DB, VAPID_PUBLIC_KEY,
VAPID_PRIVATE_KEY и VAPID_SUBJECT именно во время настоящего POST /test.
Это проверка наличия, не валидности или соответствия пары ключей.
Setup использует `secret bulk`, не `versions secret bulk`; активное состояние
в аккаунте до получения live-результатов остаётся непроверенным.

На iPhone открыть установленную PWA → «Моё» → «Уведомления» →
«Отправить тестовый push». Между попытками выдержать минуту.
Не переустанавливать приложение, не выключать/включать разрешение,
не переподписывать устройство.

Проверить последовательность:

1. `test.config`: какие bindings доступны исполняемому Worker.
2. При исключении: stage, name, message, stack. URL, длинные токены и
   известные ключи замаскированы. Возможные этапы: db.identity,
   db.test.rate-limit, buildPushPayload, fetch.push-service,
   response.body.cancel.
3. `push.response`: HTTP-код push-сервиса и accepted. Это не подтверждение
   показа на телефоне. После accepted:true проверить само уведомление и тап:
   должен открыться #ritual-coffee-cinnamon.

После диагностики отключить временные сообщения, добавив в vars существующего
wrangler.local.json `"PUSH_DEBUG": "false"`, затем повторив preview deploy.
В ENVIRONMENT, отличном от preview, эти сообщения всегда отключены.
