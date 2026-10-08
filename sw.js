// При изменении любого файла приложения повышайте VERSION и APP_VERSION в app.js.
const VERSION='1.0.0';
const CACHE='bbm-shell-'+VERSION;
const FILES=['./','./index.html','./app.css','./app.js','./rituals.js','./calendar.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(file=>new Request(new URL(file,self.location.href),{cache:'reload'})))));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('bbm-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;event.respondWith((async()=>{const cache=await caches.open(CACHE);if(request.mode==='navigate')return (await cache.match('./index.html'))||fetch(request);const cached=await cache.match(request,{ignoreSearch:true});return cached||fetch(request);})());});
