import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPairSync} from 'node:crypto';
import worker,{validateState,validateSubscription,deliver,scheduled,sendPush} from '../src/worker.js';
import {logPushError} from '../src/diagnostics.js';
const origin='https://pwa-prototype.byitovaya-magiya.pages.dev',S=globalThis.BBMPushSchedule;
function db(){const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(new URL('../migrations/0001_push.sql',import.meta.url),'utf8'));return {sql,prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}};}};},async all(){return {results:sql.prepare(q).all()};}};},async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};}
function keypair(){const p=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),pub=p.publicKey.export({format:'jwk'}),priv=p.privateKey.export({format:'jwk'});return {publicKey:Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,'base64url'),Buffer.from(pub.y,'base64url')]).toString('base64url'),privateKey:priv.d};}
const keys=keypair(),subscription={endpoint:'https://web.push.apple.com/test-token',keys:{p256dh:keys.publicKey,auth:Buffer.alloc(16,2).toString('base64url')}};
const defaults=()=>({enabled:true,timezone:'Europe/Moscow',preferences:Object.fromEntries(S.BASE.map(p=>[p.id,true])),reminders:[],subscription});
function env(){return {DB:db(),APP_ORIGIN:origin,ENVIRONMENT:'preview',PUSH_DEBUG:'false',VAPID_SUBJECT:origin,VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey};}
const id='a'.repeat(32),secret='b'.repeat(64),headers={'Origin':origin,'X-Install-Id':id,'Authorization':'Bearer '+secret,'Content-Type':'application/json'};
const call=(e,method,data,h=headers,path='/installation')=>worker.fetch(new Request('https://example.workers.dev'+path,{method,headers:h,body:data?JSON.stringify(data):undefined}),e);
test('API enforces origin, secret, bounded inputs and exact five preferences',async()=>{
 const e=env();assert.equal((await call(e,'PUT',defaults())).status,200);
 assert.equal((await call(e,'GET',undefined,{...headers,Authorization:'Bearer '+'c'.repeat(64)})).status,403);
 assert.equal((await call(e,'DELETE',undefined,{...headers,Origin:'https://evil.example'})).status,403);
 assert.equal((await call(e,'PUT',{...defaults(),timezone:'Not/AZone'})).status,400);
 assert.equal((await call(e,'PUT',{...defaults(),reminders:[{ritualId:'bad'}]})).status,400);
 assert.throws(()=>validateSubscription({...subscription,endpoint:'http://127.0.0.1/'}));assert.throws(()=>validateSubscription({...subscription,endpoint:'https://web.push.apple.com.evil.example/'}));
 assert.throws(()=>validateState({...defaults(),preferences:{...defaults().preferences,extra:true}}));
 const row=e.DB.sql.prepare('SELECT * FROM installations').get();assert.notEqual(row.secret_hash,secret);assert(!JSON.stringify(row).includes('favorites'));assert.equal(e.DB.sql.prepare('SELECT COUNT(*) n FROM jobs').get().n,6);
 assert.equal((await call(e,'PUT',defaults())).status,200);assert.equal(e.DB.sql.prepare('SELECT COUNT(*) n FROM jobs').get().n,6);
});
async function oneJob(e,{once=true,ritualId='coffee-cinnamon',revision='d'.repeat(32)}={}){
 const time=Date.now()+600000,p=S.parts(time,'Europe/Moscow'),r={ritualId,revision,type:once?'once':'weekly',localTime:String(p.h).padStart(2,'0')+':'+String(p.min).padStart(2,'0'),...(once?{date:S.dayKey(p)}:{weekday:0})};
 assert.equal((await call(e,'PUT',{...defaults(),reminders:[r]})).status,200);
 return e.DB.sql.prepare('SELECT j.*,i.subscription,i.timezone FROM jobs j JOIN installations i ON i.id=j.install_id WHERE j.id=?').get('custom:'+ritualId);
}
test('Once sends once; completion survives sync; editing and deletion',async()=>{
 const e=env(),j=await oneJob(e);let sends=0;await deliver(e,j,j.next_at,async()=>{sends++;return 201;});await deliver(e,j,j.next_at,async()=>{sends++;return 201;});assert.equal(sends,1);assert.equal(e.DB.sql.prepare('SELECT active FROM jobs WHERE id=?').get(j.id).active,0);
 assert.equal((await (await call(e,'GET')).json()).completed.length,1);
 await oneJob(e);assert.equal(e.DB.sql.prepare('SELECT active FROM jobs WHERE id=?').get(j.id).active,0);
 await oneJob(e,{revision:'e'.repeat(32)});assert.equal(e.DB.sql.prepare('SELECT active FROM jobs WHERE id=?').get(j.id).active,1);
 await call(e,'PUT',defaults());assert.equal(e.DB.sql.prepare("SELECT COUNT(*) n FROM jobs WHERE kind='custom'").get().n,0);
});
test('Near duplicates, disabled installations and stale removed jobs cannot send',async()=>{
 const e=env(),j=await oneJob(e);let sends=0;await deliver(e,j,j.next_at,async()=>{sends++;return 201;});
 const k={...j,id:'base:cinnamon-morning',revision:'f',next_at:j.next_at+120000};e.DB.sql.prepare('UPDATE jobs SET revision=?,next_at=? WHERE id=?').run(k.revision,k.next_at,k.id);
 await deliver(e,k,k.next_at,async()=>{sends++;return 201;});assert.equal(sends,1);
 const n=await oneJob(e,{revision:'g'.repeat(32)});await call(e,'DELETE');await deliver(e,n,n.next_at,async()=>{sends++;return 201;});assert.equal(sends,1);
 const t=await oneJob(e,{revision:'h'.repeat(32)});await call(e,'PUT',defaults());await deliver(e,t,t.next_at,async()=>{sends++;return 201;});assert.equal(sends,1);
});
test('410 clears endpoint; explicit 503 retries; ambiguous error never duplicates',async()=>{
 const e=env(),j=await oneJob(e);await deliver(e,j,j.next_at,async()=>410);assert.equal(e.DB.sql.prepare('SELECT enabled FROM installations').get().enabled,0);assert.equal(e.DB.sql.prepare('SELECT subscription FROM installations').get().subscription,null);
 const f=env(),k=await oneJob(f);let count=0;await deliver(f,k,k.next_at,async()=>{count++;return 503;});await deliver(f,k,k.next_at,async()=>{count++;return 201;});assert.equal(count,2);
 const g=env(),n=await oneJob(g);let uncertain=0;await deliver(g,n,n.next_at,async()=>{uncertain++;throw Error('network');});await deliver(g,n,n.next_at,async()=>{uncertain++;return 201;});assert.equal(uncertain,1);
});
test('Scheduler ignores disabled preferences and is idempotent',async()=>{
 const e=env(),v=defaults();v.preferences['red-friday']=false;await call(e,'PUT',v);assert.equal(e.DB.sql.prepare("SELECT active FROM jobs WHERE id='base:friday'").get().active,0);
 await scheduled({scheduledTime:Date.now()},e);await scheduled({scheduledTime:Date.now()},e);assert.equal(e.DB.sql.prepare('SELECT COUNT(*) n FROM deliveries').get().n,0);
});
test('Apple-compatible aes128gcm/VAPID encrypted request',async()=>{
 const old=globalThis.fetch;let checked=false;globalThis.fetch=async(url,init)=>{assert.equal(url,subscription.endpoint);assert.equal(init.headers['content-encoding'],'aes128gcm');assert.match(init.headers.authorization,/^vapid /);assert.equal(init.body.byteLength,4096);assert.equal(init.redirect,'manual');checked=true;return new Response(null,{status:201});};
 try{assert.equal(await sendPush(env(),subscription,{title:'Тест',body:'Кириллица',ritualId:'coffee-cinnamon'}),201);assert(checked);}finally{globalThis.fetch=old;}
});
test('Completed once stays completed after timezone changes; future weekly reschedules',async()=>{
 const e=env(),j=await oneJob(e);await deliver(e,j,j.next_at,async()=>201);
 const saved=JSON.parse(j.spec),v={...defaults(),timezone:'Europe/Riga',reminders:[saved]};assert.equal((await call(e,'PUT',v)).status,200);assert.equal(e.DB.sql.prepare('SELECT active FROM jobs WHERE id=?').get(j.id).active,0);
 const f=env(),k=await oneJob(f,{once:false});const original=k.next_at;const body={...defaults(),timezone:'America/New_York',reminders:[JSON.parse(k.spec)]};assert.equal((await call(f,'PUT',body)).status,200);assert.notEqual(f.DB.sql.prepare('SELECT next_at FROM jobs WHERE id=?').get(k.id).next_at,original);
});
test('Unknown delivery is visible as a failure rather than a successful completion',async()=>{
 const e=env(),j=await oneJob(e);await deliver(e,j,j.next_at,async()=>{throw Error('network');});const state=await (await call(e,'GET')).json();assert.equal(state.completed.length,0);assert.equal(state.failed[0].outcome,'unknown');
});
test('Actual scheduled handler dispatches a due once and does not repeat it',async()=>{
 const e=env(),j=await oneJob(e),now=Date.now();e.DB.sql.prepare('UPDATE jobs SET next_at=? WHERE id=?').run(now-1000,j.id);
 const old=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;return new Response(null,{status:201});};
 try{await scheduled({scheduledTime:now},e);await scheduled({scheduledTime:now+300000},e);assert.equal(sends,1);assert.equal(e.DB.sql.prepare('SELECT active FROM jobs WHERE id=?').get(j.id).active,0);}finally{globalThis.fetch=old;}
});
test('Preview diagnostics redact all subscription/installation/VAPID values and stay off in production',()=>{
 const e={...env(),PUSH_DEBUG:'true'},messages=[],old=console.error;
 const sensitive=[subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,secret];
 console.error=(...args)=>messages.push(args.join(' '));
 try{
  const failure=new TypeError([...sensitive,e.VAPID_PRIVATE_KEY,'https://other.invalid/token','Bearer short-secret'].join(' '));
  logPushError(e,'buildPushPayload',failure,sensitive);
  logPushError(e,'outer',failure,sensitive);
  logPushError({...e,ENVIRONMENT:'production'},'off',new Error('production'));
  logPushError({...e,PUSH_DEBUG:'false'},'off',new Error('disabled'));
  assert.equal(messages.length,1);
  const result=JSON.parse(messages[0].replace('PUSH_PREVIEW_DIAGNOSTIC ',''));
  assert.equal(result.stage,'buildPushPayload');assert.equal(result.name,'TypeError');assert(result.stack);
  for(const value of [...sensitive,e.VAPID_PRIVATE_KEY,'https://other.invalid/token','short-secret'])assert(!messages[0].includes(value));
 }finally{console.error=old;}
});
test('POST /test reports build failure safely and keeps the existing subscription',async()=>{
 const e=env();await call(e,'PUT',defaults());delete e.VAPID_PRIVATE_KEY;e.PUSH_DEBUG='true';
 const logs=[],oldError=console.error,oldLog=console.log;
 console.error=(...args)=>logs.push(args.join(' '));console.log=(...args)=>logs.push(args.join(' '));
 try{
  const response=await call(e,'POST',{},headers,'/test');assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'Сервис временно недоступен'});
  assert(logs.some(x=>x.includes('"stage":"buildPushPayload"')));
  assert(logs.some(x=>x.includes('"VAPID_PRIVATE_KEY":false')));
  for(const value of [subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,secret])assert(!logs.join('\n').includes(value));
  assert.equal(e.DB.sql.prepare('SELECT enabled FROM installations').get().enabled,1);
 }finally{console.error=oldError;console.log=oldLog;}
});
test('POST /test accepts only 2xx, rejects redirects without following them, and preserves status handling',async()=>{
 const old=globalThis.fetch;
 try{
  for(const status of [200,201,202,204,301,302,303,307,308,400,401,403,404,410,429,500,503]){
   const e=env();await call(e,'PUT',defaults());let sends=0;
   globalThis.fetch=async(url,init)=>{sends++;assert.equal(url,subscription.endpoint);assert.equal(init.redirect,'manual');return new Response(null,{status,headers:status>=300&&status<400?{Location:'https://redirect.invalid/'}:{}});};
   const response=await call(e,'POST',{},headers,'/test'),accepted=status>=200&&status<300;
   assert.equal(response.status,accepted?200:502,'push status '+status);assert.deepEqual(await response.json(),{accepted});assert.equal(sends,1);
   const row=e.DB.sql.prepare('SELECT enabled,subscription FROM installations').get();
   assert.equal(row.enabled,status===404||status===410?0:1);
   assert.equal(row.subscription===null,status===404||status===410);
  }
 }finally{globalThis.fetch=old;}
});
