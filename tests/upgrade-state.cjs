const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd(),oldFiles={};
 // Snapshot опубликованного клиента 1.0.2: воспроизводимый тест реального обновления.
 for(const file of ['index.html','app.js','sw.js'])oldFiles[file]=fs.readFileSync('tests/fixtures/v1.0.2/'+file);
 let upgraded=false;
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/index.html'){res.writeHead(301,{Location:'/'});return res.end();}const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(target)]||'text/plain');res.setHeader('Cache-Control','no-store');res.end(!upgraded&&oldFiles[path.basename(target)]?oldFiles[path.basename(target)]:fs.readFileSync(target));}catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(4176,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||undefined,headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Moscow'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-08T12:00:00Z')});
 await page.goto('http://127.0.0.1:4176/');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
 assert.equal(await page.evaluate(()=>APP_VERSION),'1.0.2');await page.locator('[data-save="coffee-cinnamon"]').click();await page.locator('[data-done="coffee-cinnamon"]').click();await page.getByRole('button',{name:'Ладно, начинаем'}).click();
 await page.goto('http://127.0.0.1:4176/#mine');await page.getByLabel('Увеличить текст описаний').check();await page.getByLabel('Практики лунной фазы на главном').uncheck();const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('bbm-pwa-v1')));
 upgraded=true;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});await page.locator('#applyUpdate').waitFor({state:'visible'});await page.locator('#applyUpdate').click();await page.waitForFunction(()=>APP_VERSION==='1.1.0');
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('bbm-pwa-v1')));for(const k of Object.keys(before))assert.deepEqual(after[k],before[k]);assert.equal(after.schemaVersion,2);assert.deepEqual(after.reminders,[]);
 assert(await page.evaluate(async()=>{const keys=await caches.keys(),c=await caches.open('bbm-shell-1.1.0');return !keys.includes('bbm-shell-1.0.2')&&(await c.keys()).length===13&&!(await c.match(location.origin+'/')).redirected;}));
 await context.setOffline(true);await page.reload();assert.equal(await page.locator('.stat b').first().innerText(),'1');await page.getByRole('button',{name:'Напомнить',exact:true}).click();assert(await page.locator('#reminderDialog').isVisible());
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: real 1.0.2 shell -> 1.1.0 waiting worker update, all legacy fields unchanged, model defaults persisted, old cache removed, 13 files offline, root not redirected, new reminder dialog offline.');
 await browser.close();await new Promise(resolve=>server.close(resolve));
})().catch(e=>{console.error(e);process.exit(1);});
