import '../../moon-core.js';
import '../../push-schedule.js';
import ritualTitles from './ritual-titles.json' with {type:'json'};
import {buildPushPayload} from '@block65/webcrypto-web-push';
import {logPushError,logPushConfig,logPushResponse} from './diagnostics.js';
const S=globalThis.BBMPushSchedule;
const json=(data,status=200)=>Response.json(data,{status});
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const keyOK=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{20,100}$/.test(x);
const sha=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),b=>b.toString(16).padStart(2,'0')).join('');
function timezone(tz){try{if(typeof tz!=='string'||tz.length>80)throw 0;new Intl.DateTimeFormat('en',{timeZone:tz});return tz;}catch{throw error('Некорректный часовой пояс');}}
export function validateSubscription(s){
 if(!s||typeof s.endpoint!=='string'||s.endpoint.length>2048)throw error('Некорректная подписка');
 let u;try{u=new URL(s.endpoint);}catch{throw error('Некорректный endpoint');}
 const h=u.hostname,allowed=h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com');
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!allowed)throw error('Неподдерживаемый push-сервис');
 const decode=(v,n)=>{try{return typeof v==='string'&&/^[A-Za-z0-9_-]+$/.test(v)&&Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0)).length===n;}catch{return false;}};
 if(!decode(s.keys?.p256dh,65)||!decode(s.keys?.auth,16))throw error('Некорректные ключи подписки');
 return {endpoint:u.href,expirationTime:null,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export function validateState(b,now=Date.now()){
 if(!b||typeof b.enabled!=='boolean'||!b.preferences||typeof b.preferences!=='object'||Array.isArray(b.preferences)||!Array.isArray(b.reminders)||b.reminders.length>26)throw error('Некорректные настройки');
 const tz=timezone(b.timezone),preferences={};for(const p of S.BASE){if(typeof b.preferences[p.id]!=='boolean')throw error('Некорректный набор');preferences[p.id]=b.preferences[p.id];}
 if(Object.keys(b.preferences).some(id=>!S.BASE.some(p=>p.id===id)))throw error('Неизвестный набор');
 const seen=new Set(),reminders=b.reminders.map(r=>{
 if(!r||!ritualTitles[r.ritualId]||seen.has(r.ritualId)||!keyOK(r.revision)||!['weekly','once'].includes(r.type)||!S.validTime(r.localTime))throw error('Некорректное напоминание');seen.add(r.ritualId);
 const v={ritualId:r.ritualId,revision:r.revision,type:r.type,localTime:r.localTime};
 if(r.type==='weekly'){if(!Number.isInteger(r.weekday)||r.weekday<0||r.weekday>6)throw error('Некорректный день');v.weekday=r.weekday;}
 else{if(!S.validDate(r.date))throw error('Некорректная дата');v.date=r.date;const [y,m,d]=r.date.split('-').map(Number);if(S.at({y,m,d},r.localTime,tz)===null)throw error('Это время отсутствует при переводе часов');}
 return v;});
 return {timezone:tz,enabled:b.enabled,preferences,reminders,subscription:b.enabled?validateSubscription(b.subscription):null};
}
async function readBody(request){if(Number(request.headers.get('content-length'))>20000)throw error('Запрос слишком большой',413);const reader=request.body?.getReader();if(!reader)throw error('Пустой запрос');let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000){await reader.cancel();throw error('Запрос слишком большой',413);}chunks.push(value);}try{const bytes=new Uint8Array(size);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}catch{throw error('Некорректный JSON');}}
async function identity(request,db){const id=request.headers.get('X-Install-Id'),secret=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!keyOK(id)||!keyOK(secret))throw error('Нужна авторизация установки',401);const hash=await sha(secret),row=await db.prepare('SELECT * FROM installations WHERE id=?').bind(id).first();if(row&&row.secret_hash!==hash)throw error('Нет доступа к установке',403);return {id,hash,row};}
async function sync(request,env){
 const db=env.DB,{id,hash,row}=await identity(request,db),v=validateState(await readBody(request)),now=Date.now();
 // Не отправляем новый просроченный once; старый завершённый узнаём по revision.
 const existing=(await db.prepare('SELECT id,revision,next_at,active FROM jobs WHERE install_id=?').bind(id).all()).results;
 for(const r of v.reminders)if(r.type==='once'&&S.next(r,v.timezone,now)===null&&!existing.some(x=>x.id==='custom:'+r.ritualId&&x.revision.split(':')[0]===r.revision))throw error('Выберите дату и время в будущем');
 if(!row){const made=await db.prepare('INSERT OR IGNORE INTO installations(id,secret_hash,timezone,updated_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM installations)<20').bind(id,hash,v.timezone,now).run();if(!made.meta.changes)throw error('Тестовый лимит: 20 установок',429);const owner=await db.prepare('SELECT secret_hash FROM installations WHERE id=?').bind(id).first();if(owner?.secret_hash!==hash)throw error('Нет доступа',403);}
 const stmts=[db.prepare('UPDATE installations SET subscription=?,endpoint_hash=?,timezone=?,enabled=?,preferences=?,updated_at=? WHERE id=?').bind(v.subscription?JSON.stringify(v.subscription):null,v.subscription?await sha(v.subscription.endpoint):null,v.timezone,Number(v.enabled),JSON.stringify(v.preferences),now,id)];
 const jobs=[];
 for(const slot of S.slots){const base=S.BASE.find(p=>p.id===slot.base);jobs.push({id:'base:'+slot.id,kind:'base',ritualId:base.ritualId,revision:v.timezone+':'+v.preferences[base.id],active:v.preferences[base.id],spec:slot});}
 for(const r of v.reminders)jobs.push({id:'custom:'+r.ritualId,kind:'custom',ritualId:r.ritualId,revision:r.revision,active:true,spec:r});
 const ids=jobs.map(j=>j.id);
 stmts.push(db.prepare('DELETE FROM jobs WHERE install_id=? AND id NOT IN (SELECT value FROM json_each(?))').bind(id,JSON.stringify(ids)));
 for(const j of jobs){const prev=existing.find(x=>x.id===j.id&&x.revision===j.revision);const unchanged=prev&&row?.timezone===v.timezone;const next=prev&&!prev.active?null:unchanged?prev.next_at:j.active?S.next(j.spec,v.timezone,now):null;stmts.push(db.prepare(`INSERT INTO jobs(install_id,id,kind,ritual_id,revision,spec,next_at,active) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(install_id,id) DO UPDATE SET spec=excluded.spec,next_at=CASE WHEN jobs.revision=excluded.revision AND jobs.active=0 THEN NULL ELSE excluded.next_at END,active=CASE WHEN jobs.revision=excluded.revision AND jobs.active=0 THEN 0 ELSE excluded.active END,outcome=CASE WHEN jobs.revision=excluded.revision THEN jobs.outcome ELSE NULL END,revision=excluded.revision`).bind(id,j.id,j.kind,j.ritualId,j.revision,JSON.stringify(j.spec),next,Number(j.active&&next!==null)));}
 await db.batch(stmts);
 return status(db,id);
}
async function status(db,id){const row=await db.prepare('SELECT enabled,timezone FROM installations WHERE id=?').bind(id).first();const jobs=(await db.prepare("SELECT ritual_id,revision,active,outcome FROM jobs WHERE install_id=? AND kind='custom'").bind(id).all()).results;return json({enabled:!!row?.enabled,timezone:row?.timezone,failed:jobs.filter(j=>!j.active&&!['sent','deduplicated'].includes(j.outcome)).map(j=>({ritualId:j.ritual_id,outcome:j.outcome})),completed:jobs.filter(j=>!j.active&&['sent','deduplicated'].includes(j.outcome)).map(j=>({ritualId:j.ritual_id,revision:j.revision.split(':')[0]}))});}
export async function sendPush(env,subscription,payload){
 let stage='buildPushPayload';
 try{
  const init=await buildPushPayload({data:payload,options:{ttl:1800,urgency:'normal'}},subscription,{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});
  stage='fetch.push-service';
  const r=await fetch(subscription.endpoint,{...init,redirect:'error',signal:AbortSignal.timeout(10000)});
  logPushResponse(env,r.status);
  stage='response.body.cancel';await r.body?.cancel();return r.status;
 }catch(e){logPushError(env,stage,e,[subscription?.endpoint,subscription?.keys?.p256dh,subscription?.keys?.auth]);throw e;}
}
export async function deliver(env,job,now,send=sendPush){
 const db=env.DB,occurrence=job.next_at,key=job.id+'|'+job.revision+'|'+occurrence;
 // Атомарная запись до сети: повторный Cron не повторяет неопределённую отправку.
 const claimed=await db.prepare(`INSERT OR IGNORE INTO deliveries(install_id,event_key,ritual_id,scheduled_at,status,created_at) SELECT ?,?,?,?,'claimed',? WHERE NOT EXISTS(SELECT 1 FROM deliveries WHERE install_id=? AND ritual_id=? AND ABS(scheduled_at-?)<=300000 AND status IN ('claimed','sent','unknown')) AND EXISTS(SELECT 1 FROM jobs j JOIN installations i ON i.id=j.install_id WHERE j.install_id=? AND j.id=? AND j.revision=? AND j.next_at=? AND j.active=1 AND i.enabled=1)`).bind(job.install_id,key,job.ritual_id,occurrence,now,job.install_id,job.ritual_id,occurrence,job.install_id,job.id,job.revision,occurrence).run();
 let accepted=false,outcome;
 if(claimed.meta.changes){
  const spec=JSON.parse(job.spec),payload={title:job.kind==='base'?spec.title:'Время поколдовать',body:job.kind==='base'?spec.body:ritualTitles[job.ritual_id],ritualId:job.ritual_id,tag:job.ritual_id+'-'+occurrence};
  let code;try{code=await send(env,JSON.parse(job.subscription),payload);}catch(e){logPushError(env,'scheduled.send',e);code=0;}
  accepted=code>=200&&code<300;
  if(code===404||code===410)await db.prepare('UPDATE installations SET enabled=0,subscription=NULL,endpoint_hash=NULL WHERE id=?').bind(job.install_id).run();
  if(code===429||code>=500){await db.prepare('DELETE FROM deliveries WHERE install_id=? AND event_key=?').bind(job.install_id,key).run();return;}
  outcome=accepted?'sent':code===0?'unknown':'rejected';
  await db.prepare('UPDATE deliveries SET status=? WHERE install_id=? AND event_key=?').bind(accepted?'sent':code===0?'unknown':'rejected',job.install_id,key).run();
 }else{const previous=await db.prepare("SELECT status FROM deliveries WHERE install_id=? AND ritual_id=? AND ABS(scheduled_at-?)<=300000 ORDER BY (status='sent') DESC LIMIT 1").bind(job.install_id,job.ritual_id,occurrence).first();if(!previous)return;outcome=previous.status==='sent'?'deduplicated':'unknown';}
 const spec=JSON.parse(job.spec),next=spec.type==='once'?null:S.next(spec,job.timezone,Math.max(now,occurrence));
 await db.prepare('UPDATE jobs SET next_at=?,active=?,outcome=? WHERE install_id=? AND id=? AND revision=? AND next_at=?').bind(next,Number(next!==null),outcome,job.install_id,job.id,job.revision,occurrence).run();
}
export async function scheduled(event,env,ctx){
 const now=event.scheduledTime||Date.now(),db=env.DB;
 const lock=await db.prepare("INSERT INTO guards(id,until_at) VALUES('cron',?) ON CONFLICT(id) DO UPDATE SET until_at=excluded.until_at WHERE guards.until_at<?").bind(now+240000,now).run();if(!lock.meta.changes)return;
 try{
  // Индекс due + маленькая порция для Free; без полного обхода подписчиков.
  const jobs=(await db.prepare(`SELECT j.*,i.subscription,i.timezone FROM jobs j JOIN installations i ON i.id=j.install_id WHERE j.active=1 AND j.next_at<=? AND i.enabled=1 ORDER BY j.next_at,j.kind LIMIT 4`).bind(now).all()).results;
  for(const j of jobs){if(now-j.next_at>1800000){const spec=JSON.parse(j.spec),next=spec.type==='once'?null:S.next(spec,j.timezone,now);await db.prepare("UPDATE jobs SET next_at=?,active=?,outcome='expired' WHERE install_id=? AND id=? AND revision=?").bind(next,Number(next!==null),j.install_id,j.id,j.revision).run();}else await deliver(env,j,now);}
  await db.prepare('DELETE FROM deliveries WHERE created_at<?').bind(now-45*86400000).run();
 }finally{await db.prepare("DELETE FROM guards WHERE id='cron' AND until_at=?").bind(now+240000).run();}
}
export default {scheduled,async fetch(request,env){
 const origin=request.headers.get('Origin'),headers={'Access-Control-Allow-Origin':env.APP_ORIGIN,'Vary':'Origin','Cache-Control':'no-store'};
 const finish=r=>{for(const [k,v] of Object.entries(headers))r.headers.set(k,v);return r;};
 if(origin!==env.APP_ORIGIN)return json({error:'Origin запрещён'},403);
 if(request.method==='OPTIONS')return finish(new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET,PUT,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Install-Id'}}));
 let stage='request';
 try{
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')return finish(json({ok:true,environment:env.ENVIRONMENT}));
  if(path==='/config'&&request.method==='GET')return finish(json({publicKey:env.VAPID_PUBLIC_KEY}));
  if(path==='/installation'&&request.method==='PUT')return finish(await sync(request,env));
  if(path==='/test'&&request.method==='POST')logPushConfig(env);
  stage='db.identity';
  const {id,row}=await identity(request,env.DB);if(!row)throw error('Подписка ещё не создана',404);
  if(path==='/installation'&&request.method==='GET')return finish(await status(env.DB,id));
  if(path==='/installation'&&request.method==='DELETE'){await env.DB.prepare('UPDATE installations SET enabled=0,subscription=NULL,endpoint_hash=NULL,updated_at=? WHERE id=?').bind(Date.now(),id).run();return finish(json({enabled:false}));}
  if(path==='/test'&&request.method==='POST'&&env.ENVIRONMENT==='preview'){
   stage='db.test.rate-limit';
   if(!row.enabled||!row.subscription)throw error('Сначала включите уведомления');const now=Date.now();const claim=await env.DB.prepare('UPDATE installations SET test_at=? WHERE id=? AND test_at<? AND enabled=1').bind(now,id,now-60000).run();if(!claim.meta.changes)throw error('Тест доступен раз в минуту',429);
   stage='test.subscription-or-send';
   const code=await sendPush(env,JSON.parse(row.subscription),{title:'Вселенная на связи',body:'Это тест. Кофе с корицей ждёт внутри.',ritualId:'coffee-cinnamon',tag:'preview-test'});
   if(code===404||code===410)await env.DB.prepare('UPDATE installations SET enabled=0,subscription=NULL,endpoint_hash=NULL WHERE id=?').bind(id).run();
   return finish(json({accepted:code>=200&&code<300},code>=200&&code<300?200:502));
  }
  throw error('Не найдено',404);
 }catch(e){if(!e.status)logPushError(env,stage,e,[request.headers.get('Authorization')?.replace(/^Bearer /,'')]);return finish(json({error:e.status?e.message:'Сервис временно недоступен'},e.status||503));}
}};
