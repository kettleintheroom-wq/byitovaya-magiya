const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={Date,Intl,Map,Set};vm.createContext(ctx);
vm.runInContext(['rituals.js','model.js','storage.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n')+';globalThis.api={normalise,checkedState,createJournalStore,STORE,BACKUP_STORE};',ctx);
const m=ctx.api,plain=v=>JSON.parse(JSON.stringify(v));
const sample={schemaVersion:2,favorites:['coffee-cinnamon','laurel-wallet','paired'],log:[{id:'coffee-cinnamon',date:'2026-10-08',ts:1791450000000},{id:'laurel-wallet',date:'2026-10-13',ts:1791880000000}],settings:{largeText:true,showPhase:false},onboarded:true,reminders:[{ritualId:'coffee-cinnamon',kind:'calendar',timing:'morning',enabled:true,updatedAt:10,timezone:'Europe/Moscow',localTime:'09:00'}]};
function fake(initial={}){const values=new Map(Object.entries(initial)),writes=[];return {values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push(key);values.set(key,value);}};}
const text=JSON.stringify(sample);
// Reproduce the exact destructive fallback in old 1.1.0 startup, with a failed normaliser.
const old=fs.readFileSync('tests/fixtures/v1.1.0/app.js','utf8');
const storage=fake({[m.STORE]:text}),oldCtx={localStorage:storage,normalise:r=>{if(r.log?.length)throw new Error('Simulated migration failure');return m.normalise(r);}};
vm.createContext(oldCtx);vm.runInContext(old.slice(old.indexOf("const STORE="),old.indexOf('let randomId=')),oldCtx);
assert.equal(JSON.parse(storage.getItem(m.STORE)).log.length,0);assert.equal(JSON.parse(storage.getItem(m.STORE)).favorites.length,0);
console.log('REPRODUCED: 1.1.0 catches a migration error then overwrites a valid journal with defaults. This does not prove the cause on the physical iPhone.');
const healthy=fake({[m.STORE]:text});let store=m.createJournalStore(()=>healthy);let loaded=store.load();assert.equal(loaded.status,'ready');assert.deepEqual(plain(loaded.state),sample);assert.equal(healthy.writes.length,0);
for(const badNormaliser of [()=>{throw new Error('failed');},()=>m.normalise({})]){
 const disk=fake({[m.STORE]:text});const broken=m.createJournalStore(()=>disk,badNormaliser);assert.equal(broken.load().status,'invalid');assert(!broken.save(m.normalise({})).ok);assert.equal(disk.getItem(m.STORE),text);assert.equal(disk.writes.length,0);
}
const disk=fake({[m.STORE]:text});let failRead=true;const get=disk.getItem;disk.getItem=key=>{if(failRead&&key===m.STORE){failRead=false;throw new Error('Temporary read failure');}return get(key);};store=m.createJournalStore(()=>disk);assert.equal(store.load().status,'unavailable');assert(!store.save(m.normalise({})).ok);assert.equal(get(m.STORE),text);assert.equal(store.load().state.log.length,2);assert.equal(disk.writes.length,0);
const corrupt=fake({[m.STORE]:'{broken',[m.BACKUP_STORE]:text});store=m.createJournalStore(()=>corrupt);loaded=store.load();assert.equal(loaded.status,'recovered');assert.equal(loaded.state.log.length,2);assert.equal(corrupt.getItem(m.STORE),'{broken');assert(store.checkpoint().ok);assert.equal(corrupt.getItem(m.BACKUP_STORE),text);
assert(store.save({...loaded.state,favorites:[...loaded.state.favorites,'red-friday']}).ok);assert.equal(JSON.parse(corrupt.getItem(m.STORE)).log.length,2);assert.equal(corrupt.getItem(m.BACKUP_STORE),text);
const partial=fake({[m.STORE]:JSON.stringify({...sample,favorites:'broken',reminders:{bad:1},settings:{largeText:true,showPhase:'bad'}})});store=m.createJournalStore(()=>partial);loaded=store.load();assert.equal(loaded.state.log.length,2);assert(loaded.state.onboarded);assert(loaded.state.settings.largeText);assert.equal(partial.writes.length,0);
const future=fake({[m.STORE]:JSON.stringify({...sample,schemaVersion:99})});store=m.createJournalStore(()=>future);assert.equal(store.load().status,'invalid');assert(!store.save(m.normalise({})).ok);assert.equal(JSON.parse(future.getItem(m.STORE)).schemaVersion,99);
const empty=fake();store=m.createJournalStore(()=>empty);assert.equal(store.load().status,'empty');assert(store.save(m.normalise({})).ok);assert.equal(JSON.parse(empty.getItem(m.STORE)).log.length,0);
const replace=fake({[m.STORE]:text});store=m.createJournalStore(()=>replace);store.load();assert(store.save(m.normalise({}),{replace:true}).ok);assert.equal(replace.getItem(m.BACKUP_STORE),text);assert.equal(store.load().state.log.length,0,'An intentional empty replacement must not resurrect backup');
const concurrent=fake({[m.STORE]:text});store=m.createJournalStore(()=>concurrent);store.load();const other=JSON.stringify({...sample,favorites:['red-friday']});concurrent.setItem(m.STORE,other);assert.equal(store.save(sample).reason,'changed');assert.equal(concurrent.getItem(m.STORE),other);
const noSpace=fake({[m.STORE]:text});store=m.createJournalStore(()=>noSpace);store.load();noSpace.setItem=(key)=>{throw new Error('Quota');};assert(!store.save({...sample,favorites:[]}).ok);assert.equal(noSpace.getItem(m.STORE),text);
const legacy=fake({'bbm-v5':JSON.stringify({log:sample.log})});store=m.createJournalStore(()=>legacy);loaded=store.load();assert.equal(loaded.status,'legacy');assert.equal(loaded.state.log.length,2);assert.equal(legacy.getItem(m.STORE),null);assert(store.save(loaded.state).ok);assert(legacy.getItem('bbm-v5'));
assert(!fs.readFileSync('app.js','utf8').includes('localStorage.clear('));assert(!fs.readFileSync('storage.js','utf8').includes('removeItem('));
console.log('PASS: no writes on load, normaliser throw/empty and transient reads cannot overwrite main, bounded backup/recovery, partial state, future schema, empty state, intentional replace, stale-tab protection, quota, legacy source.');
