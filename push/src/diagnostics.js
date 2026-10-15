// Temporary preview diagnostics. Never pass a request, subscription or env to console.
const seen=new WeakSet();
export function previewDiagnostics(env){return env.ENVIRONMENT==='preview'&&env.PUSH_DEBUG!=='false';}
export function logPushError(env,stage,error,sensitive=[]){
 if(!previewDiagnostics(env))return;
 if(error&&typeof error==='object'){if(seen.has(error))return;seen.add(error);}
 const values=[env.VAPID_PRIVATE_KEY,env.VAPID_PUBLIC_KEY,...sensitive].filter(v=>typeof v==='string'&&v.length);
 const clean=value=>{
  let text=String(value??'');
  for(const value of values)text=text.split(value).join('[REDACTED]');
  return text.replace(/https?:\/\/[^\s"'<>]+/gi,'[URL REDACTED]').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/[A-Za-z0-9_+/=-]{20,}/g,'[TOKEN REDACTED]').slice(0,4000);
 };
 console.error('PUSH_PREVIEW_DIAGNOSTIC '+JSON.stringify({event:'error',stage,name:clean(error?.name||'Error'),message:clean(error?.message||'Unknown error'),stack:clean(error?.stack||'')}));
}
export function logPushConfig(env){
 if(!previewDiagnostics(env))return;
 console.log('PUSH_PREVIEW_DIAGNOSTIC '+JSON.stringify({event:'test.config',DB:typeof env.DB?.prepare==='function',VAPID_PUBLIC_KEY:typeof env.VAPID_PUBLIC_KEY==='string'&&env.VAPID_PUBLIC_KEY.length>0,VAPID_PRIVATE_KEY:typeof env.VAPID_PRIVATE_KEY==='string'&&env.VAPID_PRIVATE_KEY.length>0,VAPID_SUBJECT:typeof env.VAPID_SUBJECT==='string'&&env.VAPID_SUBJECT.length>0}));
}
export function logPushResponse(env,status){
 if(previewDiagnostics(env))console.log('PUSH_PREVIEW_DIAGNOSTIC '+JSON.stringify({event:'push.response',status,accepted:status>=200&&status<300}));
}
