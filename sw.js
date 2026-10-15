// При изменении файлов приложения повышайте VERSION и APP_VERSION в app.js.
const VERSION = '1.3.1';
importScripts('./push-navigation.js');
const CACHE = 'bbm-shell-' + VERSION;
const ROOT = new URL('./', self.location.href).href;
const FILES = [
  './',
  './app.css',
  './app.js',
  './rituals.js',
  './calendar.js',
  './moon-core.js',
  './push-schedule.js',
  './push-config.js',
  './push-ui.js',
  './push-navigation.js',
  './model.js',
  './storage.js',
  './share-cards.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

// Safari не принимает ответ с историей редиректов для навигации.
// Обычно ROOT не редиректит. Защитная нормализация нужна и для сетевого fallback.
function navigationResponse(response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(file => new Request(new URL(file, ROOT), { cache: 'reload' })));
    const rootResponse = await cache.match(ROOT);
    if (rootResponse?.redirected) await cache.put(ROOT, navigationResponse(rootResponse));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('bbm-shell-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      const cachedRoot = await cache.match(ROOT);
      return navigationResponse(cachedRoot || await fetch(ROOT, { cache: 'no-cache' }));
    }
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached || fetch(request);
  })());
});

// Payload никогда не задаёт произвольный URL: только известный id ритуала.
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let p;try{p=event.data?.json();}catch{}
  const valid=p&&typeof p.title==='string'&&typeof p.body==='string'&&typeof p.ritualId==='string'&&/^[a-z0-9-]{1,80}$/.test(p.ritualId);
  await self.registration.showNotification(valid?p.title.slice(0,100):'Бытовая магия',{body:valid?p.body.slice(0,240):'Вселенная напоминает заглянуть в приложение.',icon:new URL('./icons/icon-192.png',ROOT).href,tag:valid&&typeof p.tag==='string'?p.tag.slice(0,150):'bbm-reminder',data:{ritualId:valid?p.ritualId:null}});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const id=event.notification.data?.ritualId,valid=typeof id==='string'&&/^[a-z0-9-]{1,80}$/.test(id),url=new URL(valid?'#ritual-'+id:'#today',ROOT).href;
  let intent=null;
  if(valid)try{intent=await BBMPushNavigation.save(id);}catch{}
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const inScope=windows.filter(c=>{const u=new URL(c.url),root=new URL(ROOT);return u.origin===root.origin&&u.pathname.startsWith(root.pathname);});
  const client=inScope.find(c=>c.focused)||inScope[0];
  if(client){
   let active=client;
   // iOS may focus an existing window without applying a postMessage route.
   // IndexedDB above is the durable handoff. These are only fast paths.
   // Client.url can retain an old hash after in-app navigation; do not use it
   // to decide whether the live page is already showing this ritual.
   if(typeof client.navigate==='function'){
    try{active=await client.navigate(url)||client;}catch{}
   }
   try{await active.focus();}catch{}
   if(valid)try{active.postMessage({type:'OPEN_RITUAL',ritualId:id,...(intent?{navigationId:intent.id}:{})});}catch{}
  }
  else await self.clients.openWindow(url);
 })());
});
