// Shared by the page and its service worker. Separate from journal/push identity.
(function(root){
 'use strict';
 const DB='bbm-push-navigation-v1',STORE='handoff',TTL=5*60*1000;
 function valid(intent,now=Date.now()){
  return !!intent&&intent.type==='ritual'&&typeof intent.id==='string'&&intent.id.length>=16&&intent.id.length<=128&&typeof intent.ritualId==='string'&&/^[a-z0-9-]{1,80}$/.test(intent.ritualId)&&Number.isSafeInteger(intent.createdAt)&&intent.createdAt<=now&&now-intent.createdAt<=TTL;
 }
 function open(){return new Promise((resolve,reject)=>{
  if(!root.indexedDB){reject(new Error('Navigation storage unavailable'));return;}
  const request=root.indexedDB.open(DB,1);let settled=false;
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
  request.onerror=()=>{settled=true;reject(request.error);};
  request.onblocked=()=>{settled=true;reject(new Error('Navigation storage blocked'));};
  request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
 });}
 async function transaction(mode,run){
  const db=await open();
  return new Promise((resolve,reject)=>{
   let result,tx;
   try{tx=db.transaction(STORE,mode);}catch(error){db.close();reject(error);return;}
   tx.oncomplete=()=>{db.close();resolve(result);};
   tx.onabort=()=>{db.close();reject(tx.error||new Error('Navigation transaction aborted'));};
   try{run(tx.objectStore(STORE),value=>{result=value;});}catch(error){tx.abort();db.close();reject(error);}
  });
 }
 function recent(value,now){return Array.isArray(value)?value.filter(x=>typeof x?.id==='string'&&Number.isFinite(x.at)&&x.at<=now&&now-x.at<=TTL).slice(-32):[];}
 async function save(ritualId){
  const intent={type:'ritual',ritualId,createdAt:Date.now(),id:root.crypto.randomUUID()};
  if(!valid(intent))throw new Error('Invalid navigation intent');
  // Resolve only on transaction completion, before focus/navigate is attempted.
  await transaction('readwrite',store=>store.put(intent,'pending'));return intent;
 }
 async function read(now){
  return transaction('readwrite',(store,done)=>{
   const request=store.get('pending');request.onsuccess=()=>{
    const intent=request.result;if(!intent){done(null);return;}
    const consumed=store.get('consumed');consumed.onsuccess=()=>{
     const time=now??Date.now();
     if(!valid(intent,time)||recent(consumed.result,time).some(x=>x.id===intent.id)){store.delete('pending');done(null);}
     else done(intent);
    };
   };
  });
 }
 async function discard(id){return transaction('readwrite',store=>{
  const request=store.get('pending');request.onsuccess=()=>{if(request.result?.id===id)store.delete('pending');};
 });}
 async function complete(intent,now=Date.now()){
  return transaction('readwrite',store=>{
   const request=store.get('pending');request.onsuccess=()=>{
    // A newer tap may have replaced the slot while the page was opening details.
    if(request.result?.id===intent.id)store.delete('pending');
    const consumed=store.get('consumed');consumed.onsuccess=()=>store.put([...recent(consumed.result,now).filter(x=>x.id!==intent.id),{id:intent.id,at:now}].slice(-32),'consumed');
   };
  });
 }
 root.BBMPushNavigation=Object.freeze({TTL,valid,save,read,discard,complete});
})(globalThis);
