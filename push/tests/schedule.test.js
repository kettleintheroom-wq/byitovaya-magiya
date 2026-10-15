import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../moon-core.js';
import '../../push-schedule.js';
const S=globalThis.BBMPushSchedule,utc=s=>Date.parse(s),next=(id,tz,after)=>S.next(S.slots.find(x=>x.id===id),tz,utc(after));
test('Wednesday, Thursday and Friday use local time',()=>{
 assert.equal(next('cinnamon-eve','Europe/Moscow','2026-10-14T16:59Z'),utc('2026-10-14T17:00Z'));
 assert.equal(next('cinnamon-morning','Europe/Moscow','2026-10-14T17:00Z'),utc('2026-10-15T06:00Z'));
 assert.equal(next('friday','Europe/Moscow','2026-10-15T07:00Z'),utc('2026-10-16T06:00Z'));
});
test('Month ends include leap February and year boundary',()=>{
 for(const [start,end] of [['2027-02-01','2027-02-28'],['2028-02-01','2028-02-29'],['2026-04-01','2026-04-30'],['2026-12-01','2026-12-31']])assert.equal(next('first-eve','Europe/Moscow',start+'T00:00Z'),utc(end+'T17:00Z'));
});
test('DST uses timezone IDs; nonexistent times skip, ambiguous times occur once',()=>{
 assert.equal(S.at({y:2026,m:3,d:29},'03:30','Europe/Riga'),null);
 assert.equal(S.at({y:2026,m:10,d:25},'03:30','Europe/Riga'),utc('2026-10-25T00:30Z'));
 assert.equal(S.next({type:'weekly',weekday:0,localTime:'03:30'},'Europe/Riga',utc('2026-03-28T00:00Z')),utc('2026-04-05T00:30Z'));
 assert.equal(S.next({type:'once',date:'2026-10-25',localTime:'18:00'},'Europe/Riga',utc('2026-10-24T00:00Z')),utc('2026-10-25T16:00Z'));
 assert.equal(S.next({type:'once',date:'2026-10-25',localTime:'18:00'},'Europe/Riga',utc('2026-10-25T16:00Z')),null);
});
test('New moon and first waning day follow the same noon calendar rule',()=>{
 for(const tz of ['Europe/Riga','Europe/Moscow','America/New_York','Pacific/Auckland'])for(const slot of S.slots.filter(x=>x.rule==='newmoon'||x.rule==='waning')){
  const ms=S.next(slot,tz,utc('2026-10-01T00:00Z')),p=S.parts(ms,tz),noon=new Date(S.at(p,'12:00',tz));
  if(slot.rule==='newmoon')assert.equal(BBMMoon.principalOn(noon,tz).key,'new');
  else{assert.equal(BBMMoon.moonAt(noon).key,'waning');assert.notEqual(BBMMoon.moonAt(new Date(S.at(S.addDay(p,-1),'12:00',tz))).key,'waning');}
 }
});
test('Original client lunar algorithm is unchanged for 2 years in DST and non-DST zones',()=>{
 const source=fs.readFileSync(new URL('../../tests/fixtures/v1.1.4/calendar.js',import.meta.url),'utf8');
 const old=process.env.TZ;
 for(const tz of ['Europe/Riga','Europe/Moscow','America/New_York']){
  process.env.TZ=tz;const box={Date,Intl,Map};vm.createContext(box);vm.runInContext('const same=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();'+source+';globalThis.api={moonAt,principalOn};',box);
  for(let n=0;n<732;n++){const d=new Date(Date.UTC(2026,9,14+n,12)),p=S.parts(d,tz),noon=new Date(S.at(p,'12:00',tz));assert.equal(BBMMoon.moonAt(noon).key,box.api.moonAt(noon).key);assert.equal(BBMMoon.principalOn(noon,tz)?.key,box.api.principalOn(noon)?.key);}
 }
 if(old===undefined)delete process.env.TZ;else process.env.TZ=old;
});
