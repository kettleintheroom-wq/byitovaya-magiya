// Локальная проверка workerd: только синтетические ключи, без отправки push.
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const source=`
import {buildPushPayload} from '@block65/webcrypto-web-push';
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export default {async fetch(){
 try {
  const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const priv=await crypto.subtle.exportKey('jwk',vapid.privateKey);
  const pub=await crypto.subtle.exportKey('raw',vapid.publicKey);
  const client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const subscription={endpoint:'https://web.push.apple.com/synthetic',keys:{p256dh:b64(await crypto.subtle.exportKey('raw',client.publicKey)),auth:b64(crypto.getRandomValues(new Uint8Array(16)))}};
  const init=await buildPushPayload({data:{title:'Тест',body:'Кириллица'}},subscription,{subject:'https://pwa-prototype.byitovaya-magiya.pages.dev/',publicKey:b64(pub),privateKey:priv.d});
  return Response.json({ok:true,length:init.body.byteLength,encoding:init.headers['content-encoding'],authorizationScheme:init.headers.authorization.split(' ')[0]});
 }catch(e){return Response.json({ok:false,name:e.name,message:e.message,stack:e.stack}, {status:500});}
}};`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:'es2022',write:false});
for(const flags of [[],['nodejs_compat']]){
 let mf;
 try{
  mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'probe',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',compatibilityFlags:flags}],host:'127.0.0.1'}));
  const response=await mf.dispatchFetch('https://probe.invalid/');
  console.log(JSON.stringify({flags,status:response.status,result:await response.json()}));
 }finally{await mf?.dispose();}
}
