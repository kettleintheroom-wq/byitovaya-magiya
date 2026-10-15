// Browser acceptance: announcement, contextual reminders, UI hierarchy and widths.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd(),base='http://127.0.0.1:4190',evidence=process.env.EVIDENCE_DIR||'/tmp/bbm-1.3';fs.mkdirSync(evidence,{recursive:true});
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,base).pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(4190,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||undefined,args:['--no-sandbox']}),errors=[];
 const legacy={schemaVersion:2,favorites:['coffee-cinnamon'],log:[{id:'coffee-cinnamon',date:'2026-10-08',ts:1791450000000}],settings:{largeText:false,showPhase:true},onboarded:true,reminders:[]};
 async function make({installed=true,onboarded=true,seen=false}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Moscow'});
  await context.addInitScript(({installed,legacy,onboarded,seen})=>{
   Object.defineProperty(navigator,'standalone',{value:installed});
   window.permissionCalls=0;Object.defineProperty(window,'Notification',{value:{permission:'default',requestPermission(){window.permissionCalls++;return Promise.resolve('default');}}});
   if(!localStorage.getItem('test-seeded')){
    localStorage.setItem('test-seeded','1');
    if(onboarded)localStorage.setItem('bbm-pwa-v1',JSON.stringify(legacy));
    if(seen)localStorage.setItem('bbm-push-feature-intro-seen','1');
   }
  },{installed,legacy,onboarded,seen});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {context,page};
 }
 // Existing users have no intro flag: one introduction, no permission request.
 const old=await make();await old.page.goto(base+'/#mine');await old.page.locator('#pushIntro').waitFor({state:'visible'});
 assert.equal(await old.page.evaluate(()=>permissionCalls),0);assert.equal(await old.page.evaluate(()=>localStorage.getItem('bbm-pwa-v1')),JSON.stringify(legacy));
 await old.page.getByRole('button',{name:'Не сейчас',exact:true}).click();assert.equal(await old.page.evaluate(()=>localStorage.getItem('bbm-push-feature-intro-seen')),'1');
 await old.page.reload();await old.page.waitForTimeout(1750);assert(!await old.page.locator('#pushIntro').isVisible());
 await old.page.getByRole('link',{name:'Уведомления',exact:true}).click();assert.equal(new URL(old.page.url()).hash,'#notifications');assert.equal(await old.page.evaluate(()=>permissionCalls),0);
 await old.context.close();
 const configure=await make();await configure.page.goto(base+'/#mine');await configure.page.locator('#pushIntro').waitFor({state:'visible'});await configure.page.getByRole('button',{name:'Настроить уведомления',exact:true}).click();await configure.page.waitForURL('**/#notifications');assert.equal(await configure.page.evaluate(()=>permissionCalls),0);await configure.page.reload();await configure.page.waitForTimeout(1750);assert(!await configure.page.locator('#pushIntro').isVisible());await configure.context.close();
 // New standalone user sees onboarding first, then a later interaction opens intro.
 const fresh=await make({onboarded:false});await fresh.page.goto(base+'/#today');await fresh.page.waitForTimeout(1750);assert(!await fresh.page.locator('#pushIntro').isVisible());await fresh.page.getByRole('button',{name:'Ладно, начинаем',exact:true}).click();await fresh.page.waitForTimeout(1750);assert(!await fresh.page.locator('#pushIntro').isVisible());await fresh.page.getByRole('link',{name:'Моё',exact:true}).click();await fresh.page.locator('#pushIntro').waitFor({state:'visible'});await fresh.page.getByRole('button',{name:'Не сейчас',exact:true}).click();await fresh.page.reload();await fresh.page.waitForTimeout(1750);assert(!await fresh.page.locator('#pushIntro').isVisible());assert.equal(await fresh.page.evaluate(()=>permissionCalls),0);await fresh.context.close();
 const web=await make({installed:false});await web.page.goto(base+'/#mine');await web.page.waitForTimeout(1750);assert(!await web.page.locator('#pushIntro').isVisible());assert.equal(await web.page.evaluate(()=>localStorage.getItem('bbm-push-feature-intro-seen')),null);
 // Reminder remains in the ritual and offers a voluntary settings link when disabled.
 const page=web.page;await page.goto(base+'/#ritual-wallet-charge');await page.locator('#detail [data-push-edit]').click();await page.locator('[name=weekday]').selectOption('0');await page.locator('[name=localTime]').fill('20:00');await page.locator('#pushForm [type=submit]').click();
 assert.equal(new URL(page.url()).hash,'#ritual-wallet-charge');assert(await page.locator('#detail').isVisible());assert(!await page.locator('#pushDialog').isVisible());assert((await page.locator('#toast').innerText()).includes('Напоминание сохранено. Чтобы оно пришло, включите уведомления.'));assert(await page.locator('#detail #toast a').isVisible());assert.equal(await page.locator('#detail [data-push-edit]').innerText(),'Напомнить · Вс, 20:00');assert.equal(await page.evaluate(()=>permissionCalls),0);
 await page.locator('#detail [data-push-edit]').click();await page.locator('[name=localTime]').fill('21:15');await page.locator('#pushForm [type=submit]').click();assert.equal(await page.locator('#detail [data-push-edit]').innerText(),'Напомнить · Вс, 21:15');await page.locator('#detail [data-push-edit]').click();await page.getByRole('button',{name:'Удалить напоминание',exact:true}).click();assert.equal(await page.locator('#detail [data-push-edit]').innerText(),'Напомнить');assert(await page.locator('#detail').isVisible());
 // Open #mine, another ritual + dialog, and same ritual: all incoming routes work.
 await page.evaluate(()=>navigator.serviceWorker.ready);
 const message=()=>page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'OPEN_RITUAL',ritualId:'coffee-cinnamon'}})));
 await page.goto(base+'/#mine');await message();await page.waitForURL('**/#ritual-coffee-cinnamon');assert.equal(await page.locator('#detailTitle').innerText(),'Кофе с корицей');
 await page.goto(base+'/#ritual-wallet-charge');await page.locator('#detail [data-push-edit]').click();await message();await page.waitForURL('**/#ritual-coffee-cinnamon');assert(!await page.locator('#pushDialog').isVisible());assert.equal(await page.locator('dialog[open]').count(),1);await message();assert.equal(await page.locator('dialog[open]').count(),1);assert.equal(await page.locator('#detailTitle').innerText(),'Кофе с корицей');
 // Card body opens details; separate save/done targets do not open the dialog.
 await page.goto(base+'/#rituals');const card=page.locator('.ritual-card').first();assert.equal(await page.getByRole('button',{name:'Как это делается',exact:true}).count(),0);await card.locator('[data-save]').click();assert(!await page.locator('#detail').isVisible());await card.locator('[data-done]').click();assert(!await page.locator('#detail').isVisible());await card.locator('p').click();assert(await page.locator('#detail').isVisible());assert.equal(await page.locator('#detail button.primary').count(),1);assert.equal(await page.locator('#detailFavorite').getAttribute('aria-pressed'),'false');
 // Every main/utility screen, both text modes, required mobile widths + desktop.
 for(const large of [false,true]){
  await page.evaluate(large=>{state.settings.largeText=large;persist();render();},large);
  for(const width of [320,375,390,430,1280]){
   await page.setViewportSize({width,height:844});
   for(const screen of ['today','calendar','rituals','mine','notifications','journal-data','updates','ritual-coffee-cinnamon']){
    await page.goto(base+'/#'+screen);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow '+[large,width,screen]);
    if(screen.startsWith('ritual-')){
     assert(await page.locator('#detail').evaluate(el=>el.scrollWidth<=el.clientWidth),'Detail overflow '+width);
     await page.locator('#detail [data-push-edit]').click();assert(await page.locator('#pushDialog').evaluate(el=>el.scrollWidth<=el.clientWidth),'Form overflow '+width);await page.locator('[data-close=pushDialog]').click();
    }
    const clipped=await page.locator('main button,main a,dialog[open] button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&n.scrollWidth>n.clientWidth+1).map(n=>n.textContent));assert.deepEqual(clipped,[],'Clipped controls '+[large,width,screen]);
    if(width===390&&!large&&['today','mine','notifications','ritual-coffee-cinnamon'].includes(screen))await page.screenshot({path:path.join(evidence,screen+'.png'),fullPage:!screen.startsWith('ritual-')});
   }
  }
 }
 await page.goto(base+'/#mine');assert.equal(await page.locator('.settings [data-action=export],.settings [data-action=import],.settings [data-action=check-update]').count(),0);await page.getByRole('link',{name:'Данные журнала',exact:true}).click();await page.getByRole('button',{name:'Скачать копию журнала',exact:true}).waitFor({state:'visible'});assert(await page.getByRole('button',{name:'Восстановить журнал из файла',exact:true}).isVisible());
 assert.equal(errors.length,0,errors.join('\n'));await web.context.close();await browser.close();await new Promise(r=>server.close(r));
 console.log('PASS: installed-only once announcement after onboarding, both actions and no automatic permission; reminder save/edit/delete stays in ritual with toast; #mine/other/same ritual push message; independent card targets; 320/375/390/430/1280 normal+large text and settings hierarchy.');
})().catch(e=>{console.error(e);process.exit(1)});
