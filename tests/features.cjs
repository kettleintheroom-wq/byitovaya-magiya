const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd(),version=fs.readFileSync('app.js','utf8').match(/APP_VERSION='([^']+)'/)[1];
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/index.html'){res.writeHead(301,{Location:'/'});return res.end();}const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end();}const target=file===root?path.join(root,'index.html'):file;try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(target)]||'text/plain');res.end(fs.readFileSync(target));}catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(4175,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||undefined,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Moscow',acceptDownloads:true});
 const page=await context.newPage(),errors=[],evidence=process.env.EVIDENCE_DIR||'/tmp';page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-13T12:00:00Z')});
 // Seed old state before loading 1.1; verify actual UI migration.
 const legacy={favorites:['laurel-wallet'],log:[{id:'laurel-wallet',date:'2026-10-08',ts:1791450000000}],settings:{largeText:true,showPhase:false},onboarded:true,reminders:[{ritualId:'coffee-cinnamon',timing:'morning',enabled:true,updatedAt:100}]};
 await page.addInitScript(value=>{if(!localStorage.getItem('bbm-pwa-v1'))localStorage.setItem('bbm-pwa-v1',JSON.stringify(value));},legacy);
 await page.goto('http://127.0.0.1:4175/#mine');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
 const getState=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bbm-pwa-v1')));
 let current=await getState();for(const k of Object.keys(legacy))assert.deepEqual(current[k],legacy[k]);assert.equal(await page.evaluate(()=>state.schemaVersion),2);assert.deepEqual(current.reminders,legacy.reminders);
 assert.equal(await page.locator('.stat b').first().innerText(),'1');assert.equal((await page.locator('.category-stats dd').allTextContents()).reduce((n,x)=>n+Number(x),0),1);
 await page.getByLabel('Увеличить текст описаний').uncheck();
 // Legacy reminders are kept in data, but absent from every user-facing screen and detail.
 for(const tab of ['today','calendar','rituals','mine']){await page.goto('http://127.0.0.1:4175/#'+tab);assert(!/уведомления появ|реквизитом/i.test(await page.locator('body').innerText()));assert.equal(await page.locator('[data-remind],#reminderDialog,.reminders').count(),0);}
 await page.goto('http://127.0.0.1:4175/#ritual-coffee-cinnamon');
 assert.equal(await page.locator('#detail [data-share]').innerText(),'Позвать вместе');
 await page.evaluate(()=>{navigator.share=async data=>{window.inviteShared=data;};});await page.locator('#detail [data-share]').click();
 assert.deepEqual(await page.evaluate(()=>window.inviteShared),{title:'Кофе с корицей',text:'Кофе с корицей по четвергам. Пойдём колдовать вместе.',url:'http://127.0.0.1:4175/#ritual-coffee-cinnamon'});
 await page.evaluate(()=>navigator.share=undefined);
 for(const width of [320,390,430,1280]){await page.setViewportSize({width,height:844});assert(await page.locator('#detail').evaluate(el=>el.scrollWidth<=el.clientWidth));assert(await page.locator('#detail [data-share]').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().height>=48));}
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:evidence+'/ritual-invite-mobile.png'});
 assert.equal(await page.locator('#detail [data-remind]').count(),0);await page.getByRole('button',{name:'Закрыть карточку'}).click();
 // Random selection, no immediate repeats, action buttons on the selected card.
 await page.goto('http://127.0.0.1:4175/#today');let previous=null;
 assert.equal(await page.locator('.hero-actions button').count(),1);
 assert.equal(await page.locator('.hero-actions button').innerText(),'Поделиться карточкой');
 assert(!(await page.locator('main').innerText()).includes('Текст и ссылка'));
 assert.equal(await page.locator('[data-action=random]').innerText(),'Случайный ритуал');
 assert((await page.locator('.random-box').boundingBox()).height<=96);
 assert((await page.locator('[data-action=random]').boundingBox()).height>=48);
 assert((await page.locator('.hero-actions button').boundingBox()).width<300);
 for(let i=0;i<20;i++){await page.locator('[data-action=random]').click();const id=await page.locator('.random-box [data-open]').first().getAttribute('data-open');assert.equal(await page.locator('[data-action=random]').innerText(),'Другой случайный ритуал');assert.notEqual(id,previous);assert(!['coffee-cinnamon','red-friday','cinnamon-door','grapes','road','knock-wood','paired','moon-money'].includes(id));previous=id;}
 await page.locator('.random-box [data-save]').click();await page.locator('.random-box [data-done]').click();assert(await page.locator('.random-box [data-done]').isDisabled());
 await page.locator('.random-box [data-open]').first().click();assert(await page.locator('#detail').isVisible());await page.getByRole('button',{name:'Закрыть карточку'}).click();
 // Daily PNG generation and download fallback; no external assets.
 await page.locator('[data-action=day-image]').click();await page.locator('#cardPreview').waitFor({state:'visible'});
 assert.equal(await page.locator('#imageDialog button:not(.icon-btn)').count(),1);assert.equal(await page.locator('#imageDialog a').count(),0);assert.equal(await page.locator('#imageTitle').innerText(),'Карточка готова');assert(await page.locator('#cardPreview').evaluate(img=>img.naturalWidth===1080&&img.naturalHeight===1920));
 const png=await Promise.all([page.waitForEvent('download'),page.locator('#shareImage').click()]).then(([d])=>d);await png.saveAs(evidence+'/share-day.png');
 const bytes=fs.readFileSync(evidence+'/share-day.png');assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1920);
 await page.getByRole('button',{name:'Закрыть изображение'}).click();
 // Simulated file-capable native share: called from a separate click with a pre-built File.
 await page.evaluate(()=>{navigator.canShare=({files})=>files?.[0]?.type==='image/png';navigator.share=async({files})=>{window.shared={name:files[0].name,size:files[0].size,type:files[0].type,activation:navigator.userActivation.isActive};};});
 await page.goto('http://127.0.0.1:4175/#mine');await page.locator('[data-image-done="laurel-wallet"][data-log-date="2026-10-08"]').click();await page.locator('#shareImage').waitFor({state:'visible'});await page.locator('#shareImage').click();
 const shared=await page.evaluate(()=>window.shared);assert.equal(shared.type,'image/png');assert(shared.size>1000);assert(shared.activation);assert(shared.name.includes('2026-10-08'));
 await page.evaluate(()=>navigator.canShare=()=>false);const done=await Promise.all([page.waitForEvent('download'),page.locator('#shareImage').click()]).then(([d])=>d);await done.saveAs(evidence+'/share-done.png');
 await page.evaluate(()=>{navigator.canShare=()=>true;navigator.share=async()=>{throw new DOMException('Cancelled','AbortError');};});await page.locator('#shareImage').click();assert(!(await page.locator('#imageStatus').innerText()).includes('не получилось'));
 await page.evaluate(()=>{navigator.share=async()=>{throw new DOMException('Denied','NotAllowedError');};});await Promise.all([page.waitForEvent('download'),page.locator('#shareImage').click()]);assert((await page.locator('#imageStatus').innerText()).includes('загруженную'));
 await page.getByRole('button',{name:'Закрыть изображение'}).click();
 // Existing text-share fallback is still available in the ritual detail, not in the PNG window.
 await page.evaluate(()=>{navigator.share=undefined;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied')}}});});
 await page.goto('http://127.0.0.1:4175/#ritual-laurel-wallet');await page.locator('#detail [data-share]').click();await page.locator('#shareText').waitFor({state:'visible'});assert((await page.locator('#shareText').inputValue()).includes('Пойдём колдовать вместе: «Лавр в кошелёк».'));assert((await page.locator('#shareText').inputValue()).includes('#ritual-laurel-wallet'));
 await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();await page.getByRole('button',{name:'Закрыть карточку',exact:true}).click();await page.goto('http://127.0.0.1:4175/#mine');
 // Export/import round trip, merge dedup and latest reminder wins.
 await page.getByRole('link',{name:'Данные журнала',exact:true}).click();
 const download=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Скачать копию журнала',exact:true}).click()]).then(([d])=>d);await download.saveAs(evidence+'/journal-export.json');
 const exported=JSON.parse(fs.readFileSync(evidence+'/journal-export.json'));assert.equal(exported.schemaVersion,2);assert(exported.reminders.length);
 const upload=async(content,name='journal.json')=>{await page.locator('#journalFile').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(content)});await page.locator('#importDialog').waitFor({state:'visible'});};
 const before=await getState();await upload(JSON.stringify(exported));await page.getByRole('button',{name:'Объединить с текущими',exact:true}).click();assert.deepEqual(await getState(),before);
 for(const invalid of ['broken','{}','[]',JSON.stringify({favorites:['unknown'],log:[]})]){await upload(invalid);assert(await page.locator('#importDialog .error').isVisible());await page.getByRole('button',{name:'Понятно',exact:true}).click();assert.deepEqual(await getState(),before);}
 await upload('x'.repeat(2*1024*1024+1));assert((await page.locator('#importDialog').innerText()).includes('слишком большой'));await page.getByRole('button',{name:'Понятно',exact:true}).click();
 const incoming={favorites:['red-friday'],log:[{id:'red-friday',date:'2026-10-09',ts:1791500000000},{id:'unknown',date:'bad',ts:'bad'}],settings:{largeText:true,showPhase:true},onboarded:true,reminders:[{ritualId:'coffee-cinnamon',timing:'eve',enabled:true,updatedAt:1999999999999}]};
 await upload(JSON.stringify(incoming));await page.getByRole('button',{name:'Заменить текущие данные',exact:true}).click();assert(await page.getByRole('button',{name:'Да, заменить данные',exact:true}).isVisible());assert.deepEqual(await getState(),before);await page.getByRole('button',{name:'Отмена',exact:true}).click();assert.deepEqual(await getState(),before);
 await upload(JSON.stringify(incoming));await page.getByRole('button',{name:'Объединить с текущими',exact:true}).click();assert((await getState()).favorites.includes('red-friday'));assert.equal((await getState()).reminders.find(r=>r.ritualId==='coffee-cinnamon').timing,'eve');
 await upload(JSON.stringify(incoming));await page.getByRole('button',{name:'Заменить текущие данные',exact:true}).click();await page.getByRole('button',{name:'Да, заменить данные',exact:true}).click();current=await getState();assert.deepEqual(current.favorites,['red-friday']);assert.equal(current.log.length,1);assert.equal(current.reminders.length,1);assert(current.settings.largeText);
 await page.reload();assert.equal((await getState()).log.length,1);await page.goto('http://127.0.0.1:4175/#mine');assert.equal(await page.locator('.stat b').first().innerText(),'1');
 const statsBoxes=await page.locator('.stat').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
 assert.equal(statsBoxes[0],statsBoxes[1]);assert(statsBoxes[0]<=130);
 await page.screenshot({path:evidence+'/mine-features-mobile.png',fullPage:true});
 // Layout for all new dialogs including date/time input on small screens.
 for(const width of [320,360,390,430,768,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mine overflow '+width);assert(await page.locator('.actions button').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth)),'button text overflow '+width);await page.goto('http://127.0.0.1:4175/#today');await page.locator('[data-action=day-image]').click();await page.locator('#cardPreview').waitFor({state:'visible'});assert(await page.locator('#imageDialog').evaluate(el=>el.scrollWidth<=el.clientWidth),'image dialog overflow '+width);await page.getByRole('button',{name:'Закрыть изображение'}).click();await page.goto('http://127.0.0.1:4175/#mine');}
 for(const large of [false,true]){
  await page.goto('http://127.0.0.1:4175/#mine');await page.getByLabel('Увеличить текст описаний').setChecked(large);
  for(const width of [320,390,430,1280]){await page.setViewportSize({width,height:844});
   for(const tab of ['today','calendar','rituals','mine']){await page.goto('http://127.0.0.1:4175/#'+tab);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),tab+' overflow '+width+' large='+large);
    if(tab==='mine'){const heights=await page.locator('.stat').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));assert.equal(heights[0],heights[1]);}
    await page.locator('footer').scrollIntoViewIfNeeded();assert((await page.locator('footer').boundingBox()).y+(await page.locator('footer').boundingBox()).height<=(await page.locator('.bottom').boundingBox()).y,'footer overlaps navigation');
   }
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:4175/#today');await page.screenshot({path:evidence+'/today-compact-mobile.png',fullPage:true});
 // Cache includes both new scripts and all offline features still work after hard reload.
 assert(await page.evaluate(async()=>{const c=await caches.open('bbm-shell-'+APP_VERSION);return !!await c.match(location.origin+'/model.js')&&!!await c.match(location.origin+'/share-cards.js');}));
 await context.setOffline(true);await page.reload();
 await upload(JSON.stringify(exported));await page.getByRole('button',{name:'Объединить с текущими',exact:true}).click();
 await page.goto('http://127.0.0.1:4175/#today');await page.locator('[data-action=random]').click();await page.locator('[data-action=day-image]').click();await page.locator('#cardPreview').waitFor({state:'visible'});assert(await page.locator('#cardPreview').evaluate(img=>img.naturalWidth===1080));await page.getByRole('button',{name:'Закрыть изображение'}).click();
 await page.reload();assert((await getState()).reminders.length>0);
 // All ritual title lengths plus the longest combined daily summary fit the canvas.
 await page.evaluate(async()=>{for(const r of rituals)await createShareCard({type:'done',date:new Date(),title:r.title,text:'Поколдовано. Вселенная получила входящее.'});let longest='';for(let i=0;i<730;i++){const d=new Date(2026,0,1+i,12),list=scheduledForDate(d).filter(r=>!['waxing','waning'].includes(r.rule));const text=`На сегодня: ${list.map(r=>r.title).join(' · ')}. Можно без героизма — начните с одного.`;if(text.length>longest.length)longest=text;}await createShareCard({type:'day',date:new Date(),title:'У Вселенной есть поручения.',text:longest});});
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: actual legacy state migration, legacy reminders compatibility/removal from UI, filtered random/no repeat/actions, PNG 1080x1920, download, simulated file share/activation/cancel/error and text fallback, export/import/invalid/merge/replace confirmation/cancel, offline features, widths 320–1280; no page errors.');
 await browser.close();await new Promise(resolve=>server.close(resolve));
})().catch(e=>{console.error(e);process.exit(1);});
