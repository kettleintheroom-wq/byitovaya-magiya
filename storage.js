'use strict';
// Только localStorage. Кеш интерфейса и версия service worker сюда не вмешиваются.
const STORE='bbm-pwa-v1';
const BACKUP_STORE=STORE+'-backup';
function checkedState(raw,normaliser=normalise){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid state');
  if(Number.isInteger(raw.schemaVersion)&&raw.schemaVersion>STATE_SCHEMA_VERSION)throw new Error('Future state');
  const next=normaliser(raw);
  if(!next||!Array.isArray(next.log)||!Array.isArray(next.favorites)||!Array.isArray(next.reminders)||!next.settings||typeof next.onboarded!=='boolean')throw new Error('Migration shape');
  // Ни одна распознаваемая запись не должна исчезнуть из-за регрессии миграции.
  const ids=new Set(rituals.map(r=>r.id));
  for(const id of Array.isArray(raw.favorites)?raw.favorites:[])if(ids.has(id)&&!next.favorites.includes(id))throw new Error('Migration lost favorite');
  for(const x of Array.isArray(raw.log)?raw.log:[]){
    if(ids.has(x?.id)&&validDate(x?.date)&&Number.isSafeInteger(x?.ts)&&x.ts>=0&&x.ts<=8640000000000000&&!next.log.some(n=>n.id===x.id&&n.date===x.date))throw new Error('Migration lost log');
  }
  for(const key of ['largeText','showPhase'])if(typeof raw.settings?.[key]==='boolean'&&raw.settings[key]!==next.settings[key])throw new Error('Migration lost setting');
  if(raw.onboarded===true&&next.onboarded!==true)throw new Error('Migration lost onboarding');
  return next;
}
function createJournalStore(getStorage,normaliser=normalise){
  let baseline=null,blocked=false,source=null,lastState=null;
  const decode=text=>checkedState(JSON.parse(text),normaliser);
  const defaults=()=>normalise({});
  function load(previous=lastState){
    let storage,text;
    try{storage=getStorage();text=storage.getItem(STORE);}catch{blocked=true;return {state:previous||defaults(),status:'unavailable'};}
    baseline=text;source=null;
    if(text!==null){
      try{lastState=decode(text);source=text;blocked=false;return {state:lastState,status:'ready'};}catch{}
      try{const backup=storage.getItem(BACKUP_STORE);if(backup!==null){lastState=decode(backup);source=backup;blocked=false;return {state:lastState,status:'recovered'};}}catch{}
      blocked=true;return {state:previous||defaults(),status:'invalid'};
    }
    try{
      // Если основной ключ отсутствует, пробуем единственную копию, затем старый сайт.
      for(const key of [BACKUP_STORE,'bbm-v5']){const text=storage.getItem(key);if(text!==null){lastState=decode(text);source=text;blocked=false;return {state:lastState,status:key===BACKUP_STORE?'recovered':'legacy'};}}
    }catch{blocked=true;return {state:previous||defaults(),status:'invalid'};}
    lastState=defaults();blocked=false;return {state:lastState,status:'empty'};
  }
  function save(next,{replace=false}={}){
    if(blocked&&!replace)return {ok:false,reason:'blocked'};
    let storage,current,clean;
    try{
      storage=getStorage();current=storage.getItem(STORE);
      if(current!==baseline)return {ok:false,reason:'changed'};
      clean=checkedState(next,normaliser);
      // Ошибка резервирования не очищает основной ключ и не мешает обычной записи.
      const previous=source;
      if(previous!==null&&previous!==JSON.stringify(clean)){try{storage.setItem(BACKUP_STORE,previous);}catch{}}
      const text=JSON.stringify(clean);storage.setItem(STORE,text);
      if(storage.getItem(STORE)!==text)throw new Error('Storage verification');
      baseline=text;source=text;lastState=clean;blocked=false;return {ok:true,state:clean};
    }catch{return {ok:false,reason:'unavailable'};}
  }
  function checkpoint(){
    if(blocked)return {ok:false,reason:'blocked'};
    try{
      const storage=getStorage(),current=storage.getItem(STORE);
      if(current!==baseline)return {ok:false,reason:'changed'};
      if(source!==null)decode(source);
      // Не записываем STORE перед reload. Он уже содержит сохранённые действия.
      if(source!==null){try{storage.setItem(BACKUP_STORE,source);}catch{}}
      return {ok:true};
    }catch{return {ok:false,reason:'unavailable'};}
  }
  return {load,save,checkpoint};
}
