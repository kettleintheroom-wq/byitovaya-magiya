// Запуск: node tests/smoke.cjs. Playwright нужен только для проверки, не для приложения.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const http=require('node:http'),path=require('node:path');
(async()=>{
 const root=process.cwd();let testUpdate=false;
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end();}const target=file===root?path.join(root,'index.html'):file;const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};try{res.setHeader('Content-Type',mime[path.extname(target)]||'text/plain');let content=fs.readFileSync(target);if(testUpdate&&['app.js','sw.js'].includes(path.basename(target)))content=Buffer.from(content.toString().replaceAll("1.0.0","1.0.1"));res.end(content);}catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));

 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||undefined,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'Europe/Moscow'});
 const page=await context.newPage();await page.clock.install({time:new Date('2026-10-08T12:00:00Z')});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/docs/original-index.html');await page.screenshot({path:(process.env.EVIDENCE_DIR||'/tmp')+'/original-mobile.png'});
 await page.goto('http://127.0.0.1:4173/');await page.getByRole('button',{name:'Ладно, начинаем'}).click();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
 assert(await page.evaluate(async()=>{const c=await caches.open('bbm-shell-1.0.0');return (await c.keys()).length===12;}));
 await page.screenshot({path:(process.env.EVIDENCE_DIR||'/tmp')+'/today-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'Ритуалы',exact:true}).click();await page.getByRole('heading',{name:'Ритуалы',exact:true}).waitFor();
 assert.equal(await page.locator('.ritual-card').count(),26);
 await page.getByRole('searchbox').fill('кофе');assert.equal(await page.locator('.ritual-card').count(),1);
 await page.getByRole('button',{name:'Как это делается'}).click();
 await page.getByRole('button',{name:'♡ Сохранить',exact:true}).click();await page.getByRole('button',{name:'Поколдовано',exact:true}).last().click();
 assert(await page.getByRole('button',{name:'✓ Поколдовано',exact:true}).last().isDisabled());
 await page.getByRole('button',{name:'Закрыть карточку'}).click();await page.getByRole('link',{name:'Моё',exact:true}).click();await page.getByRole('heading',{name:'Моё',exact:true}).waitFor();
 assert.equal(await page.locator('.stat b').first().innerText(),'1');assert.equal(await page.locator('.ritual-card').count(),1);
 await page.getByLabel('Увеличить текст описаний').check();
 await page.reload();assert(await page.getByLabel('Увеличить текст описаний').isChecked());assert.equal(await page.locator('.stat b').first().innerText(),'1');
 await page.getByRole('link',{name:'Календарь',exact:true}).click();await page.getByRole('heading',{name:'Календарь',exact:true}).waitFor();await page.getByRole('button',{name:'Следующий месяц'}).click();
 assert((await page.locator('.monthbar strong').innerText()).toLowerCase().includes('ноябрь'));
 await page.locator('[data-select="2026-11-01"]').click();assert(await page.getByRole('button',{name:'Вдуть корицу в дом',exact:true}).isVisible());
 await page.screenshot({path:(process.env.EVIDENCE_DIR||'/tmp')+'/calendar-mobile.png',fullPage:true});
 for(const width of [320,360,390,430,768,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:4173/#ritual-cinnamon-door');assert(await page.locator('#detail').isVisible());await page.getByRole('button',{name:'Закрыть карточку'}).click();
 const manifest=await (await page.request.get('http://127.0.0.1:4173/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');for(const i of manifest.icons){const response=await page.request.get('http://127.0.0.1:4173/'+i.src.slice(2));assert(response.ok());}
 // Offline: browser uses real service worker, network disabled, hard reload.
 await context.setOffline(true);await page.goto('http://127.0.0.1:4173/#today');await page.reload();assert(await page.getByRole('link',{name:'Сегодня',exact:true}).isVisible());
 await page.getByRole('link',{name:'Ритуалы',exact:true}).click();await page.getByRole('heading',{name:'Ритуалы',exact:true}).waitFor();await page.getByRole('searchbox').fill('корица');assert((await page.locator('.ritual-card').count())>0);
 await page.getByRole('link',{name:'Моё',exact:true}).click();await page.getByRole('heading',{name:'Моё',exact:true}).waitFor();assert.equal(await page.locator('.stat b').first().innerText(),'1');
 await context.setOffline(false);
 // Exact content and original rules retained, including combined date/week rule.
 const original=fs.readFileSync('docs/original-index.html','utf8');const oldData=original.slice(original.indexOf('const OR='),original.indexOf('const weekdays='));
 const box={Intl,Date,Map,Set};vm.createContext(box);vm.runInContext('const now=new Date();const same=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();'+fs.readFileSync('rituals.js','utf8')+fs.readFileSync('calendar.js','utf8')+';globalThis.result=rituals;globalThis.scheduled=scheduledForDate;',box);
 const originalBox={};vm.createContext(originalBox);vm.runInContext(oldData+';globalThis.result=rituals;',originalBox);assert.equal(JSON.stringify(box.result),JSON.stringify(originalBox.result));
 const combined=box.scheduled(new Date(2026,9,1,12)).map(r=>r.id);for(const id of ['coffee-cinnamon','laurel-wallet','red-chandelier','cinnamon-door'])assert(combined.includes(id));assert(box.scheduled(new Date(2026,11,31,12)).some(r=>r.id==='grapes'));

 // Real update lifecycle: waiting worker, explicit activation, unchanged local journal.
 testUpdate=true;
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
 await page.locator('#applyUpdate').waitFor({state:'visible'});
 await page.getByRole('button',{name:'Обновить',exact:true}).click();
 await page.waitForFunction(()=>document.body.innerText.includes('Версия 1.0.1'));
 assert.equal(await page.locator('.stat b').first().innerText(),'1');
 assert(await page.evaluate(async()=>Boolean(await (await caches.open('bbm-shell-1.0.1')).match(new URL('./rituals.js',location.href)))));
 testUpdate=false;
 // iPhone installation instruction and share manual fallback.
 const ios=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 await ios.addInitScript(()=>{Object.defineProperty(navigator,'share',{value:undefined});Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied')}}});});
 const iphone=await ios.newPage();await iphone.goto('http://127.0.0.1:4173/#mine');
 await iphone.getByRole('button',{name:'На главный экран телефона',exact:true}).click();
 assert((await iphone.locator('#installBody').innerText()).includes('На экран Домой'));await iphone.getByRole('button',{name:'Закрыть инструкцию'}).click();
 await iphone.goto('http://127.0.0.1:4173/#ritual-coffee-cinnamon');await iphone.getByRole('button',{name:'Поделиться',exact:true}).click();
 await iphone.locator('#shareText').waitFor({state:'visible'});assert((await iphone.locator('#shareText').inputValue()).includes('#ritual-coffee-cinnamon'));await ios.close();
 assert.equal(errors.length,0,errors.join('\n'));

 console.log('PASS: 26 original records, rules, 4 screens, search, calendar, favorites, completion, reload, settings, deep link, manifest/icons, SW cache, offline reload, widths 320–1280, update lifecycle, iPhone instruction, share fallback; no page errors');
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
