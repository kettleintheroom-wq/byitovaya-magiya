// Регрессия Cloudflare /index.html -> / и обновление старого кеша без удаления журнала.
// Запуск из корня проекта: node tests/ios-navigation.cjs (Playwright + Chromium).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const assert = require('node:assert/strict');

(async () => {
  const root = process.cwd();
  const worker = fs.readFileSync('sw.js', 'utf8');
  const files = vm.runInNewContext(worker.match(/const FILES\s*=\s*(\[[\s\S]*?\]);/)[1]);
  let legacy = true;
  let networkRedirect = false;
  const legacyWorker = `
    const CACHE='bbm-shell-1.0.0';
    const FILES=${JSON.stringify(['./', './index.html', ...files.filter(f => f !== './')])};
    self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
    self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
    self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
    self.addEventListener('fetch',e=>{if(new URL(e.request.url).origin!==self.location.origin)return;
      e.respondWith((async()=>{const c=await caches.open(CACHE);
        if(e.request.mode==='navigate')return(await c.match('./index.html'))||fetch(e.request);
        return(await c.match(e.request,{ignoreSearch:true}))||fetch(e.request);})());});
  `;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/index.html' || (pathname === '/' && networkRedirect)) {
      res.writeHead(301, { Location: pathname === '/index.html' ? '/' : '/landing.html' });
      return res.end();
    }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
    const target = pathname === '/' || pathname === '/landing.html' ? path.join(root, 'index.html') : file;
    try {
      let content = fs.readFileSync(target);
      if (pathname === '/sw.js' && legacy) content = Buffer.from(legacyWorker);
      if (pathname === '/app.js' && legacy) content = Buffer.from(content.toString().replace("APP_VERSION='1.0.2'", "APP_VERSION='1.0.0'"));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml'})[path.extname(target)] || 'text/plain');
      res.end(content);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(4174, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined, args:['--no-sandbox','--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, timezoneId:'Europe/Moscow' });
  const page = await context.newPage();
  await page.clock.install({time:new Date('2026-10-08T12:00:00Z')});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = 'http://127.0.0.1:4174';
  await page.goto(base + '/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const bad = await page.evaluate(async () => {
    const cache = await caches.open('bbm-shell-1.0.0');
    const response = await cache.match(location.origin + '/index.html');
    return response.redirected;
  });
  console.log('Legacy redirected response reproduced');
  assert.equal(bad, true, 'Fixture must reproduce the legacy redirected response');
  await page.locator('[data-save="coffee-cinnamon"]').click();
  await page.locator('[data-done="coffee-cinnamon"]').click();
  const before = await page.evaluate(() => localStorage.getItem('bbm-pwa-v1'));

  legacy = false;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.locator('#applyUpdate').waitFor({state:'visible'});
  await page.locator('#applyUpdate').click();
  await page.waitForFunction(() => APP_VERSION === '1.0.2');
  assert.equal(await page.evaluate(() => localStorage.getItem('bbm-pwa-v1')), before);
  const clean = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open('bbm-shell-1.0.2');
    const requests = await cache.keys();
    const root = await cache.match(location.origin + '/');
    return { old:keys.includes('bbm-shell-1.0.0'), index:requests.some(r => new URL(r.url).pathname === '/index.html'), count:requests.length, redirected:root.redirected };
  });
  console.log('Upgrade cache check',clean);
  assert.deepEqual(clean, { old:false, index:false, count:11, redirected:false });

  // Навигация действительно обслуживается новым worker без цепочки HTTP-редиректов.
  let response = await page.goto(base + '/?launch=1#today');
  assert(response.fromServiceWorker());
  assert.equal(response.request().redirectedFrom(), null);
  await page.reload();
  await context.setOffline(true);
  response = await page.goto(base + '/?launch=2#mine');
  assert(response.fromServiceWorker());
  assert.equal(response.request().redirectedFrom(), null);
  await page.getByRole('heading', {name:'Моё',exact:true}).waitFor();
  assert.equal(await page.locator('.stat b').first().innerText(), '1');
  await page.reload();
  assert.equal(await page.locator('.stat b').first().innerText(), '1');
  console.log('Offline and relaunch passed');
  await context.setOffline(false);

  // При отсутствии root в кеше сетевой редирект также нормализуется.
  await page.evaluate(async () => (await caches.open('bbm-shell-1.0.2')).delete(location.origin + '/'));
  networkRedirect = true;
  response = await page.goto(base + '/?network-fallback=1');
  assert(response.fromServiceWorker());
  assert.equal(response.request().redirectedFrom(), null);
  await page.getByRole('heading', {name:'У Вселенной есть поручения.',exact:true}).waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: legacy cache has redirected=true; upgrade 1.0.0 -> 1.0.2 removes old cache/index entry, root.redirected=false, local journal unchanged, SW navigation/relaunch/offline work, redirected network fallback normalized.');
  await browser.close();
  await new Promise(resolve => server.close(resolve));
})().catch(error => { console.error(error); process.exit(1); });
