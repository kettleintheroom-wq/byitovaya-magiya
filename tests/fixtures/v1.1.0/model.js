'use strict';
// Чистая локальная модель. schemaVersion не связан с версией offline-кеша.
const STATE_SCHEMA_VERSION = 2;
const CONTEXT_RITUALS = new Set(['moon-money','waste-income','coin-plant','right-left','knock-wood','road','mirror-return','right-foot','marriage-mug','spath','paired']);
const ALWAYS_RITUALS = new Set(['laurel-wallet','red-chandelier','wallet-charge','coin-doormat','broom-down','desk-coin','desk-plant']);
function validDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d]=value.split('-').map(Number);
  const date=new Date(0);date.setUTCFullYear(y,m-1,d);date.setUTCHours(12,0,0,0);
  return y>=1900&&y<=9999&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
function validTime(value){return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);}
function reminderOptions(r){
  if(['thursday','friday','first','newyear'].includes(r.rule))return [
    {timing:'morning',label:'Утром в день ритуала · 09:00',kind:'calendar',localTime:'09:00'},
    {timing:'eve',label:'Вечером накануне · 20:00',kind:'calendar',localTime:'20:00'}
  ];
  if(['newmoon','fullmoon'].includes(r.rule))return [
    {timing:'event',label:'При наступлении лунного события',kind:'phase',offsetMinutes:0},
    {timing:'hour-before',label:'За час до лунного события',kind:'phase',offsetMinutes:-60}
  ];
  if(['waxing','waning'].includes(r.rule))return [{timing:'phase-start',label:'В начале подходящей лунной фазы',kind:'phase',offsetMinutes:0}];
  return [{timing:'chosen-date',label:'В выбранный день и время',kind:'once'}];
}
function cleanTimezone(value){try{return typeof value==='string'?new Intl.DateTimeFormat('en',{timeZone:value}).resolvedOptions().timeZone:'';}catch{return '';}}
function cleanReminders(list){
  const byId=new Map();
  for(const raw of Array.isArray(list)?list:[]){
    const r=rituals.find(r=>r.id===raw?.ritualId);if(!r||typeof raw.enabled!=='boolean')continue;
    const option=reminderOptions(r).find(o=>o.timing===raw.timing);if(!option)continue;
    if(option.kind==='once'&&(!validDate(raw.date)||!validTime(raw.localTime)))continue;
    const item={ritualId:r.id,kind:option.kind,timing:option.timing,enabled:raw.enabled,timezone:cleanTimezone(raw.timezone),updatedAt:Number.isSafeInteger(raw.updatedAt)&&raw.updatedAt>=0&&raw.updatedAt<8640000000000000?raw.updatedAt:0};
    if(option.kind==='once'){item.date=raw.date;item.localTime=raw.localTime;}
    if(option.localTime)item.localTime=option.localTime;
    if(option.offsetMinutes!==undefined)item.offsetMinutes=option.offsetMinutes;
    if(!byId.has(r.id)||byId.get(r.id).updatedAt<=item.updatedAt)byId.set(r.id,item);
  }
  return [...byId.values()];
}
function normalise(raw){
  const ids=new Set(rituals.map(r=>r.id)), logs=new Map();
  for(const x of Array.isArray(raw?.log)?raw.log:[]){
    if(!ids.has(x?.id)||!validDate(x?.date)||!Number.isSafeInteger(x?.ts)||x.ts<0||x.ts>8640000000000000)continue;
    const clean={id:x.id,date:x.date,ts:x.ts},key=x.id+'|'+x.date;
    if(!logs.has(key)||logs.get(key).ts>x.ts)logs.set(key,clean);
  }
  return {schemaVersion:STATE_SCHEMA_VERSION,favorites:[...new Set((Array.isArray(raw?.favorites)?raw.favorites:[]).filter(id=>ids.has(id)))],log:[...logs.values()],settings:{largeText:raw?.settings?.largeText===true,showPhase:raw?.settings?.showPhase!==false},onboarded:raw?.onboarded===true,reminders:cleanReminders(raw?.reminders)};
}
function parseJournal(text){
  let raw;try{raw=JSON.parse(text);}catch{throw new Error('В файле не получилось прочитать JSON. Выберите копию журнала «Бытовой магии».');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.favorites)||!Array.isArray(raw.log))throw new Error('Этот файл не похож на копию журнала «Бытовой магии».');
  if(Number.isInteger(raw.schemaVersion)&&raw.schemaVersion>STATE_SCHEMA_VERSION)throw new Error('Эта копия создана более новой версией приложения. Сначала обновите «Бытовую магию».');
  if(raw.favorites.length>10000||raw.log.length>100000||(Array.isArray(raw.reminders)&&raw.reminders.length>10000))throw new Error('В файле слишком много записей.');
  const result=normalise(raw);
  if((raw.favorites.length||raw.log.length||raw.reminders?.length)&&!result.favorites.length&&!result.log.length&&!result.reminders.length)throw new Error('В файле нет корректных записей журнала или сохранённых ритуалов.');
  return result;
}
function mergeJournal(current,incoming){
  const a=normalise(current),b=normalise(incoming);
  // При объединении настройки интерфейса остаются текущими, напоминания — самые свежие.
  return normalise({...a,favorites:[...a.favorites,...b.favorites],log:[...a.log,...b.log],reminders:[...a.reminders,...b.reminders],onboarded:a.onboarded||b.onboarded});
}
function monthStats(state,date){
  const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  const log=state.log.filter(x=>x.date.startsWith(key)),categories=Object.fromEntries(Object.keys(CAT).map(c=>[c,0]));
  // Одна отметка = одна категория: первая в существующей карточке. Сумма равна total.
  for(const x of log){const r=rituals.find(r=>r.id===x.id);if(r)categories[r.cat[0]]++;}
  return {total:log.length,categories,unique:new Set(state.log.map(x=>x.id)).size};
}
function eligibleRandom(date){
  return rituals.filter(r=>!CONTEXT_RITUALS.has(r.id)&&(r.rule?matchRule(r.rule,date):ALWAYS_RITUALS.has(r.id)));
}
function pickRandom(date,previousId,rng=Math.random){
  let list=eligibleRandom(date);if(list.length>1)list=list.filter(r=>r.id!==previousId);
  return list.length?list[Math.min(list.length-1,Math.max(0,Math.floor(rng()*list.length)))]:null;
}
function reminderLabel(reminder){
  const r=rituals.find(r=>r.id===reminder.ritualId),option=r&&reminderOptions(r).find(o=>o.timing===reminder.timing);
  if(reminder.kind==='once'){const [y,m,d]=reminder.date.split('-');return `${d}.${m}.${y} · ${reminder.localTime}`;}
  return option?.label||'';
}
