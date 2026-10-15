const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const box={Date,Intl,Map,Set};vm.createContext(box);
vm.runInContext('const now=new Date();const same=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();'+['rituals.js','moon-core.js','calendar.js','model.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n')+';globalThis.api={rituals,normalise,parseJournal,mergeJournal,monthStats,eligibleRandom,pickRandom,matchRule,reminderOptions,CONTEXT_RITUALS};',box);
const m=box.api,plain=v=>JSON.parse(JSON.stringify(v));
const legacy={favorites:['coffee-cinnamon','laurel-wallet'],log:[{id:'coffee-cinnamon',date:'2026-10-08',ts:1791450000000}],settings:{largeText:true,showPhase:false},onboarded:true};
const migrated=plain(m.normalise(legacy));assert.equal(migrated.schemaVersion,2);for(const key of Object.keys(legacy))assert.deepEqual(migrated[key],legacy[key]);assert.deepEqual(migrated.reminders,[]);
assert.deepEqual(plain(m.normalise(migrated)),migrated);
assert.equal(m.normalise({...legacy,log:[...legacy.log,{...legacy.log[0],ts:1791450000001},{id:'road',date:'2026-02-30',ts:1},{id:'missing',date:'2026-01-01',ts:1}]}).log.length,1);
const rem=(id,timing,updatedAt=10,extra={})=>({ritualId:id,timing,enabled:true,updatedAt,...extra});
const enriched={...legacy,reminders:[rem('coffee-cinnamon','morning'),rem('laurel-wallet','chosen-date',10,{date:'2026-11-01',localTime:'10:00'}),rem('newmoon','hour-before')]};
assert.equal(m.normalise(enriched).reminders.length,3);
assert.equal(m.normalise({...legacy,reminders:[rem('road','morning'),rem('newmoon','chosen-date'),rem('laurel-wallet','chosen-date',10,{date:'2026-11-99',localTime:'10:00'})]}).reminders.length,0);
assert.equal(m.reminderOptions(m.rituals.find(r=>r.id==='cinnamon-door'))[1].timing,'eve');
assert.equal(m.reminderOptions(m.rituals.find(r=>r.id==='waxing'))[0].timing,'phase-start');
assert.throws(()=>m.parseJournal(JSON.stringify({...legacy,schemaVersion:99})));assert.throws(()=>m.parseJournal('{broken'));assert.throws(()=>m.parseJournal('{}'));assert.throws(()=>m.parseJournal('[]'));assert.throws(()=>m.parseJournal(JSON.stringify({favorites:['missing'],log:[]})));
assert.deepEqual(plain(m.parseJournal(JSON.stringify(legacy))),migrated);
assert.equal(m.parseJournal(JSON.stringify({...enriched,extra:'ignored',log:[...legacy.log,{id:'road',date:'bad',ts:'bad'}]})).log.length,1);
const incoming={...legacy,favorites:['coffee-cinnamon','paired'],log:[...legacy.log,{id:'paired',date:'2026-10-09',ts:1791500000000}],settings:{largeText:false,showPhase:true},reminders:[rem('coffee-cinnamon','eve',20),rem('newmoon','event')]};
const merged=plain(m.mergeJournal(enriched,incoming));assert.equal(merged.favorites.length,3);assert.equal(merged.log.length,2);assert.deepEqual(merged.settings,legacy.settings);assert.equal(merged.reminders.find(r=>r.ritualId==='coffee-cinnamon').timing,'eve');
assert.deepEqual(plain(m.mergeJournal(merged,incoming)),merged);
const disabled=m.mergeJournal(merged,{favorites:[],log:[],reminders:[{...merged.reminders[0],enabled:false,updatedAt:100}]});assert.equal(disabled.reminders.find(r=>r.ritualId===merged.reminders[0].ritualId).enabled,false);
const stats=m.monthStats(m.normalise({...incoming,log:[...incoming.log,{id:'red-chandelier',date:'2026-10-11',ts:1791600000000},{id:'grapes',date:'2025-12-31',ts:1}]}),new Date(2026,9,13));assert.equal(stats.total,3);assert.equal(Object.values(stats.categories).reduce((a,b)=>a+b),3);assert.equal(stats.categories.money,2);assert.equal(stats.categories.love,1);
for(let i=0;i<730;i++){
 const date=new Date(2026,0,1+i,12),list=m.eligibleRandom(date);assert(list.length>=7);
 for(const r of list){assert(!m.CONTEXT_RITUALS.has(r.id));if(r.rule)assert(m.matchRule(r.rule,date));}
 for(let j=0;j<list.length;j++)assert.equal(m.pickRandom(date,null,()=>j/list.length).id,list[j].id);
 const first=m.pickRandom(date,null,()=>0);assert.notEqual(m.pickRandom(date,first.id,()=>0).id,first.id);
}
assert(!m.eligibleRandom(new Date(2026,9,13,12)).some(r=>['coffee-cinnamon','red-friday','cinnamon-door','grapes','road','moon-money'].includes(r.id)));
console.log('PASS: 1.0.2 state migration, import validation, partial corruption, favorites/log dedup, reminder conflict/tombstone, month category sum, eligible random for 730 dates and no immediate repeats.');
