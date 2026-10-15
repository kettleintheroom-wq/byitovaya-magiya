'use strict';
const PUSH_STORE='bbm-push-preview-v1';
let pushState=null,pushReadError=false,pushBusy=false,pushStatus='',pushFormId=null,pushSyncPromise=null,pushResync=false;
function pushDefaults(){return {preferences:Object.fromEntries(BBMPushSchedule.BASE.map(p=>[p.id,true])),reminders:[],enabled:false,dirty:false,syncedAt:0};}
try{const raw=JSON.parse(localStorage.getItem(PUSH_STORE)||'null');pushState=raw&&typeof raw==='object'&&!Array.isArray(raw)?{...pushDefaults(),...raw,preferences:Object.fromEntries(BBMPushSchedule.BASE.map(p=>[p.id,raw.preferences?.[p.id]===true])),reminders:Array.isArray(raw.reminders)?raw.reminders.filter(r=>rituals.some(x=>x.id===r.ritualId)).slice(0,26):[]}:pushDefaults();}catch{pushReadError=true;pushState=pushDefaults();}
function pushWrite(){if(pushReadError){toast('Настройки уведомлений не удалось прочитать. Перезапустите приложение.');return false;}try{const text=JSON.stringify(pushState);localStorage.setItem(PUSH_STORE,text);return localStorage.getItem(PUSH_STORE)===text;}catch{toast('Не удалось сохранить настройки уведомлений.');return false;}}
function pushIdentity(){if(!pushState.installId||!pushState.installSecret){pushState.installId=crypto.randomUUID().replaceAll('-','');pushState.installSecret=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');if(!pushWrite())throw new Error('Не удалось сохранить ключ установки');}}
function pushAvailable(){return location.origin===PUSH_CONFIG.origin&&/^https:\/\//.test(PUSH_CONFIG.api)&&(!!PUSH_CONFIG.publicKey||PUSH_CONFIG.publicKeyFromAPI===true);}
function pushIOS(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
function pushPermission(){return 'Notification' in window?Notification.permission:'unsupported';}
function pushRepaint(){if(location.hash==='#notifications')render();for(const button of document.querySelectorAll('#detail [data-push-edit]'))button.textContent=pushReminderLabel(button.dataset.pushEdit);}
const pushWeekdays=['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
function pushReminderText(r){return r.type==='weekly'?`Каждую неделю: ${pushWeekdays[r.weekday]} · ${r.localTime}`:`${r.date} · ${r.localTime}`;}
function pushReminderLabel(id){const r=pushState.reminders.find(r=>r.ritualId===id);return r?`Напомнить · ${r.type==='weekly'?['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][r.weekday]:r.date}, ${r.localTime}`:'Напомнить';}
function pushDebugEnabled(){return new URLSearchParams(location.search).get('push-debug')==='1'&&location.origin===PUSH_CONFIG.origin;}
function pushPage(){
 const permission=pushPermission(),ios=pushIOS()&&!standalone(),supported='serviceWorker' in navigator&&'PushManager' in window&&permission!=='unsupported';
 const active=pushState.enabled&&permission==='granted';
 let status=active?'Включены':'Вселенная может напоминать';
 if(pushReadError)status='Не удалось прочитать настройки';
 const enabledButton=`<button class="primary" data-push="enable" ${pushBusy||pushReadError||!pushAvailable()?'disabled':''}>${pushBusy?'Подключаем…':'Включить уведомления'}</button>`;
 let action=ios?'<p>Чтобы получать уведомления на iPhone, добавьте «Бытовую магию» на главный экран.</p><button class="text-button" data-action="install">Добавить на главный экран</button>':!supported?'<p>Этот браузер не поддерживает Web Push. Попробуйте обновить браузер или открыть установленное приложение.</p>':permission==='denied'?'<p>Уведомления запрещены. На iPhone откройте «Настройки» → «Уведомления» → «Бытовая магия» и разрешите уведомления. В другом браузере откройте настройки разрешений этого сайта.</p>':active?'':enabledButton;
 const master=active&&!ios&&supported?`<button class="push-master" role="switch" aria-label="Уведомления" aria-checked="true" data-push="disable" ${pushBusy||pushReadError?'disabled':''}><span class="switch-track" aria-hidden="true"></span></button>`:'';
 const pending=pushState.dirty||!navigator.onLine;
 return `<a href="#mine" class="back-link">‹ В «Моё»</a><div class="notification-heading"><h1>Уведомления</h1>${master}</div><section class="push-intro"><p class="push-status-label">${status}</p><p>О корице, пятницах, Луне и ваших ритуалах.</p>${!pushAvailable()?'<p class="muted">Уведомления пока недоступны. Настройки можно подготовить заранее.</p>':''}${action}${pushStatus?`<p class="muted" role="status">${esc(pushStatus)}</p>`:''}${pending?'<p class="muted">Настройки уведомлений обновятся, когда появится интернет. До подтверждения действует прежнее расписание.</p>':''}</section><h2>Базовые уведомления</h2><p class="muted">Придут только выбранные наборы, по времени вашего устройства.</p><div class="push-options">${BBMPushSchedule.BASE.map(p=>`<label><span><strong>${p.label}</strong><small>${p.hint}</small></span><input type="checkbox" data-push-base="${p.id}" ${pushState.preferences[p.id]?'checked':''} ${pushReadError?'disabled':''}></label>`).join('')}</div><h2>Мои напоминания</h2><div class="reminder-list">${pushState.reminders.length?pushState.reminders.map(r=>`<button class="settings-row push-reminder" data-push-edit="${r.ritualId}"><span><strong>${esc(rituals.find(x=>x.id===r.ritualId)?.title)}</strong><small>${esc(pushReminderText(r))}</small>${pushState.deliveryIssues?.some(x=>x.ritualId===r.ritualId)?'<small class="error">Доставка не подтверждена. Задайте новое время.</small>':''}</span><span aria-hidden="true">›</span></button>`).join(''):'<p class="muted">Нажмите «Напомнить» в карточке любого ритуала.</p>'}</div><p class="muted">Часовой пояс: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. При переводе часов отсутствующее время пропускается; повторяющееся время используется один раз.</p>${active&&pushAvailable()&&pushDebugEnabled()?'<section class="push-debug"><span class="eyebrow">ДИАГНОСТИКА</span><button class="text-button" data-push="test">Отправить тестовый push</button><p class="muted">Откроет кофе с корицей. Не чаще раза в минуту.</p></section>':''}<p class="muted privacy-note">Журнал и избранное остаются на этом устройстве. Для напоминаний хранятся только подписка, часовой пояс и расписание.</p>`;
}
async function pushAPI(method,path,data){
 const response=await fetch(PUSH_CONFIG.api+path,{method,mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','X-Install-Id':pushState.installId,'Authorization':'Bearer '+pushState.installSecret},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
 const body=await response.json();if(!response.ok){const e=new Error(body.error||'Сервер не подтвердил настройки');e.status=response.status;throw e;}return body;
}
function pushApplyStatus(result){pushState.deliveryIssues=result.failed||[];for(const r of result.completed||[]){pushState.reminders=pushState.reminders.filter(x=>!(x.ritualId===r.ritualId&&x.revision===r.revision));}}
async function pushSync(){
 if(pushSyncPromise){pushResync=true;return pushSyncPromise;}
 pushSyncPromise=(async()=>{
 if(!pushAvailable()||!pushState.installId||pushReadError)return;
 if(!navigator.onLine){pushStatus='Настройки уведомлений обновятся, когда появится интернет.';pushRepaint();return;}
 try{
  if(!pushState.enabled){if(pushState.registered)await pushAPI('DELETE','/installation');const reg=await navigator.serviceWorker.ready;await (await reg.pushManager.getSubscription())?.unsubscribe();pushState.dirty=false;pushState.syncedAt=Date.now();pushWrite();pushStatus='Уведомления отключены.';return;}
  const reg=await navigator.serviceWorker.ready,subscription=await reg.pushManager.getSubscription();
  if(!subscription||pushPermission()!=='granted'){pushState.enabled=false;pushState.dirty=true;pushWrite();if(pushState.registered)await pushAPI('DELETE','/installation');pushStatus='Подписка больше не действует. Включите уведомления снова.';return;}
  if(pushState.registered){try{const status=await pushAPI('GET','/installation');pushApplyStatus(status);if(!status.enabled&&!pushState.dirty){pushState.enabled=false;pushWrite();pushStatus='Подписка больше не действует. Включите уведомления снова.';return;}}catch(e){if(e.status!==404)throw e;}}
  const snapshot=JSON.stringify({preferences:pushState.preferences,reminders:pushState.reminders,enabled:pushState.enabled});
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const result=await pushAPI('PUT','/installation',{enabled:true,timezone,preferences:pushState.preferences,reminders:pushState.reminders,subscription:subscription.toJSON()});
  pushApplyStatus(result);pushState.registered=true;pushState.syncedAt=Date.now();pushState.timezone=timezone;
  if(snapshot===JSON.stringify({preferences:pushState.preferences,reminders:pushState.reminders,enabled:pushState.enabled}))pushState.dirty=false;
  pushWrite();pushStatus='Уведомления включены. Настройки сохранены.';
 }catch(e){pushState.dirty=true;pushWrite();pushStatus=e.status===403?'Не удалось подтвердить ключ установки. Старые настройки не заменены.':e.message||'Не удалось связаться с сервером. Изменения пока не подтверждены.';}
 finally{pushRepaint();}
 })().finally(()=>{pushSyncPromise=null;if(pushResync){pushResync=false;queueMicrotask(()=>pushSync());}});return pushSyncPromise;
}
async function pushApplicationKey(){
 let publicKey=PUSH_CONFIG.publicKey;
 if(!publicKey&&PUSH_CONFIG.publicKeyFromAPI===true){
  const response=await fetch(PUSH_CONFIG.api+'/config',{mode:'cors',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Не удалось получить публичный ключ уведомлений. Попробуйте ещё раз.');
  publicKey=(await response.json()).publicKey;
 }
 if(typeof publicKey!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(publicKey))throw new Error('Сервер не подтвердил публичный ключ уведомлений.');
 const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 if(key.length!==65||key[0]!==4)throw new Error('Некорректный публичный ключ уведомлений.');
 return key;
}
async function pushEnable(){
 if(pushBusy)return;if(pushIOS()&&!standalone()){installInstructions();return;}
 if(!pushAvailable()){toast('Сервер уведомлений ещё не подключён.');return;}
 if(pushPermission()==='denied'){pushRepaint();return;}
 if(!('PushManager' in window)||!('Notification' in window)){toast('Этот браузер не поддерживает Web Push.');return;}
 // Запрос строго в обработчике пользовательского действия, до сетевых await.
 const permissionPromise=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
 pushBusy=true;pushRepaint();
 try{
  if(await permissionPromise!=='granted'){pushStatus='Разрешение не получено. Расписание сохранено.';return;}
  pushIdentity();const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
  if(!sub){const key=await pushApplicationKey();sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}
  pushState.enabled=true;pushState.dirty=true;if(!pushWrite())throw new Error('Не удалось сохранить подписку');await pushSync();
 }catch(e){pushStatus=e.message||'Подключение не удалось. Настройки сохранены.';}
 finally{pushBusy=false;pushRepaint();}
}
function pushEdit(id){
 const ritual=rituals.find(r=>r.id===id);if(!ritual||pushReadError)return;pushFormId=id;const old=pushState.reminders.find(r=>r.ritualId===id),p=BBMPushSchedule.parts(Date.now()+3600000,Intl.DateTimeFormat().resolvedOptions().timeZone),mode=old?.type||'weekly';
 $('pushFormTitle').textContent=old?'Изменить напоминание':'Своё напоминание';
 $('pushFormBody').innerHTML=`<p>${esc(ritual.title)}</p>${BBMPushSchedule.BASE.some(b=>b.ritualId===id&&pushState.preferences[b.id])?'<p class="muted">Для этого ритуала уже есть базовое уведомление. Своё будет дополнительным.</p>':''}<label>Расписание<select name="type"><option value="weekly" ${mode==='weekly'?'selected':''}>Каждую неделю</option><option value="once" ${mode==='once'?'selected':''}>Один раз</option></select></label><label data-push-week>День недели<select name="weekday">${pushWeekdays.map((name,i)=>`<option value="${i}" ${i===(old?.weekday??0)?'selected':''}>${name[0].toUpperCase()+name.slice(1)}</option>`).join('')}</select></label><label data-push-date>Дата<input name="date" type="date" value="${esc(old?.date||BBMPushSchedule.dayKey(p))}"></label><label>Время<input name="localTime" type="time" value="${esc(old?.localTime||'20:00')}" required></label><p id="pushFormError" role="status"></p><button class="primary" type="submit">Сохранить напоминание</button>${old?`<button class="text-button destructive" type="button" data-push-remove="${id}">Удалить напоминание</button>`:''}`;
 pushFormMode();if(!$('pushDialog').open)$('pushDialog').showModal();
}
function pushFormMode(){const once=$('pushForm').elements.type.value==='once';document.querySelector('[data-push-week]').hidden=once;document.querySelector('[data-push-date]').hidden=!once;}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.pushEdit)pushEdit(b.dataset.pushEdit);
 if(b.dataset.pushRemove){const old=pushState.reminders;pushState.reminders=old.filter(r=>r.ritualId!==b.dataset.pushRemove);pushState.dirty=true;if(!pushWrite()){pushState.reminders=old;return;}$('pushDialog').close();pushRepaint();toast('Напоминание удалено');if(pushState.enabled)await pushSync();}
 if(b.dataset.push==='enable')await pushEnable();
 if(b.dataset.push==='disable'){pushState.enabled=false;pushState.dirty=true;if(pushWrite()){pushRepaint();await pushSync();}}
 if(b.dataset.push==='test'){b.disabled=true;try{const result=await pushAPI('POST','/test',{});toast(result.accepted?'Push-сервис принял тест. Проверьте уведомления телефона.':'Сервис не принял тест.');}catch(e){toast(e.message);}finally{b.disabled=false;}}
});
document.addEventListener('change',e=>{
 if(e.target.closest('#pushForm')&&e.target.name==='type')pushFormMode();
 const id=e.target.dataset.pushBase;if(!id)return;pushState.preferences[id]=e.target.checked;pushState.dirty=true;if(pushWrite()){pushRepaint();pushSync();}
});
// Обработчик формы устанавливается после app.js, когда DOM уже доступен.
document.addEventListener('DOMContentLoaded',()=>{
 $('pushForm').addEventListener('submit',e=>{e.preventDefault();const form=e.target,fd=new FormData(form),r={ritualId:pushFormId,revision:crypto.randomUUID().replaceAll('-',''),type:fd.get('type'),localTime:fd.get('localTime')};
 if(!BBMPushSchedule.validTime(r.localTime)){$('pushFormError').textContent='Выберите время.';return;}
 if(r.type==='weekly')r.weekday=Number(fd.get('weekday'));else{r.date=fd.get('date');if(!BBMPushSchedule.validDate(r.date)){$('pushFormError').textContent='Выберите дату в будущем.';return;}const [y,m,d]=r.date.split('-').map(Number),at=BBMPushSchedule.at({y,m,d},r.localTime,Intl.DateTimeFormat().resolvedOptions().timeZone);if(!BBMPushSchedule.validDate(r.date)||at===null||at<=Date.now()){$('pushFormError').textContent='Выберите существующие дату и время в будущем.';return;}}
 const old=pushState.reminders;pushState.reminders=[...old.filter(x=>x.ritualId!==r.ritualId),r];pushState.dirty=true;if(!pushWrite()){pushState.reminders=old;return;}
 $('pushDialog').close();pushStatus=pushState.enabled?'Сохраняем расписание…':'Чтобы напоминание пришло, включите уведомления.';pushRepaint();
 toast(pushState.enabled?'Напоминание сохранено':'Напоминание сохранено. Чтобы оно пришло, включите уведомления.',pushState.enabled?null:{label:'Настроить уведомления',href:'#notifications'});
 if(pushState.enabled)pushSync();
 });
 if('serviceWorker' in navigator){navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='OPEN_RITUAL'){if(!e.data.navigationId)openRitualFromPush(e.data.ritualId);consumePendingPushNavigation();}});navigator.serviceWorker.ready.then(()=>pushSync()).catch(()=>{});}
});
window.addEventListener('online',()=>pushSync());document.addEventListener('visibilitychange',()=>{if(!document.hidden)pushSync();});

// Feature introduction has its own state, unrelated to permission or journal schema.
const PUSH_INTRO_STORE='bbm-push-feature-intro-seen';
let pushIntroDismissed=false,pushIntroNeedsInteraction=true,pushIntroTimer=null;
try{pushIntroDismissed=localStorage.getItem(PUSH_INTRO_STORE)==='1';}catch{pushIntroDismissed=true;}
function pushIntroEligible(){return !pushIntroDismissed&&!pushIntroNeedsInteraction&&standalone()&&state.onboarded&&storageStatus==='ready'&&!pushReadError&&!document.hidden&&!document.querySelector('dialog[open]')&&$('update').hidden&&!$('toast').classList.contains('show')&&!location.hash.startsWith('#ritual-');}
function schedulePushIntro(){
 if(pushIntroTimer||!pushIntroEligible())return;
 pushIntroTimer=setTimeout(()=>{pushIntroTimer=null;if(pushIntroEligible())$('pushIntro').showModal();},1500);
}
function dismissPushIntro(settings=false){
 pushIntroDismissed=true;try{localStorage.setItem(PUSH_INTRO_STORE,'1');}catch{}
 $('pushIntro').close();if(settings)location.hash='notifications';
}
document.addEventListener('DOMContentLoaded',()=>{
 pushIntroNeedsInteraction=!state.onboarded;
 schedulePushIntro();
 document.addEventListener('click',e=>{
  const action=e.target.closest('[data-push-intro]');
  if(action){dismissPushIntro(action.dataset.pushIntro==='settings');return;}
  if(!state.onboarded||e.target.closest('[data-action="onboard"]'))return;
  pushIntroNeedsInteraction=false;schedulePushIntro();
 });
 $('pushIntro').addEventListener('cancel',e=>{e.preventDefault();dismissPushIntro();});
 for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',schedulePushIntro);
});
window.addEventListener('hashchange',schedulePushIntro);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedulePushIntro();});
window.addEventListener('storage',e=>{if(e.key===PUSH_INTRO_STORE&&e.newValue==='1'){pushIntroDismissed=true;if($('pushIntro').open)$('pushIntro').close();}});
