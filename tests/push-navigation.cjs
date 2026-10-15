// Real browser IndexedDB shared between SW and page. Simulates iOS losing all
// navigate/postMessage effects; it does not simulate an Apple push transport.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd(),base='http://127.0.0.1:4191',evidence=process.env.EVIDENCE_DIR||'/tmp/bbm-1.3.1';fs.mkdirSync(evidence,{recursive:true});
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,base).pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(4191,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||undefined,args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Moscow'}),errors=[];
 await context.addInitScript(()=>{localStorage.setItem('bbm-push-feature-intro-seen','1');if(!localStorage.getItem('bbm-pwa-v1'))localStorage.setItem('bbm-pwa-v1',JSON.stringify({schemaVersion:2,favorites:['coffee-cinnamon'],log:[{id:'coffee-cinnamon',date:'2026-10-08',ts:1791450000000}],settings:{largeText:false,showPhase:true},onboarded:true,reminders:[]}));});
 let page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#mine');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
 const worker=context.serviceWorkers().find(w=>w.url().endsWith('/sw.js'));
 const journal=await page.evaluate(()=>localStorage.getItem('bbm-pwa-v1'));
 async function hide(){await page.evaluate(()=>{pausePushNavigation();window.testVisibility='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.testVisibility});document.dispatchEvent(new Event('visibilitychange'));});}
 async function show(event='visibilitychange'){
  await page.evaluate(event=>{window.testVisibility='visible';if(event==='visibilitychange')document.dispatchEvent(new Event(event));else window.dispatchEvent(new Event(event));},event);
 }
 async function click(ritualId,{closed=false,storageFailure=false}={}){
  return worker.evaluate(async({ritualId,closed,storageFailure})=>{
   const original={matchAll:clients.matchAll,openWindow:clients.openWindow,api:BBMPushNavigation},steps=[];let work;
   const client={url:location.origin+'/#mine',focused:true,navigate:async function(url){steps.push({event:'navigate',url});return this;},focus:async()=>{steps.push({event:'focus',pending:!!await original.api.read()});},postMessage:message=>{steps.push({event:'message-dropped',message});}};
   clients.matchAll=async()=>closed?[]:[client];clients.openWindow=async url=>{steps.push({event:'openWindow',url,pending:!!await original.api.read()});return null;};
   if(storageFailure)globalThis.BBMPushNavigation={...original.api,save:async()=>{throw Error('IDB unavailable');}};
   try{
    const event=new Event('notificationclick');Object.defineProperties(event,{notification:{value:{close(){},data:{ritualId}}},waitUntil:{value:promise=>{work=promise;}}});
    self.dispatchEvent(event);await work;return {steps,pending:await original.api.read()};
   }finally{clients.matchAll=original.matchAll;clients.openWindow=original.openWindow;globalThis.BBMPushNavigation=original.api;}
  },{ritualId,closed,storageFailure});
 }
 async function slot(key,value){return page.evaluate(async({key,value})=>new Promise((resolve,reject)=>{const req=indexedDB.open('bbm-push-navigation-v1',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('handoff',value===undefined?'readonly':'readwrite'),store=tx.objectStore('handoff');let result;if(value===undefined){const get=store.get(key);get.onsuccess=()=>{result=get.result;};}else store.put(value,key);tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=()=>{db.close();reject(tx.error);};};}),{key,value});}
 async function expectRitual(id){await page.waitForFunction(id=>location.hash==='#ritual-'+id&&currentId===id&&document.getElementById('detail').open,id);await page.waitForFunction(async()=>!(await BBMPushNavigation.read()));assert.equal(await page.locator('dialog[open]').count(),1);}
 // 1: durable commit precedes focus. Navigate and postMessage have NO page effect.
 await hide();const first=await click('coffee-cinnamon');assert.equal(first.pending.ritualId,'coffee-cinnamon');assert(first.steps.find(s=>s.event==='focus').pending);assert(first.steps.find(s=>s.event==='message-dropped').message.navigationId);assert.equal(new URL(page.url()).hash,'#mine');
 await show();await expectRitual('coffee-cinnamon');assert.equal(await slot('pending'),undefined);assert.equal(await page.locator('#detailTitle').innerText(),'Кофе с корицей');
 // 2: another ritual with a form -> focus resumes to target and closes the form.
 await page.goto(base+'/#ritual-wallet-charge');await page.locator('#detail [data-push-edit]').click();await hide();await click('red-friday');await show('focus');await expectRitual('red-friday');assert(!await page.locator('#pushDialog').isVisible());
 // 3: target already open; concurrent lifecycle reads never open a second dialog.
 await page.evaluate(()=>{window.detailOpens=0;const original=openDetail;openDetail=function(...args){window.detailOpens++;return original(...args);};});
 await hide();await click('red-friday');await page.evaluate(async()=>{window.testVisibility='visible';await Promise.all(Array.from({length:8},()=>consumePendingPushNavigation()));});await expectRitual('red-friday');assert.equal(await page.evaluate(()=>detailOpens),0);
 // 4: expired/unknown targets are deleted without changing the current screen.
 await page.goto(base+'/#mine');await hide();const old={...first.pending,id:crypto.randomUUID(),createdAt:Date.now()-5*60*1000-1000};await slot('pending',old);await show('pageshow');await page.waitForFunction(async()=>!(await BBMPushNavigation.read()));assert.equal(new URL(page.url()).hash,'#mine');
 await hide();await click('unknown-ritual');await show();await page.waitForFunction(async()=>!(await BBMPushNavigation.read()));assert.equal(new URL(page.url()).hash,'#mine');
 // 5: reinsert a consumed ID and reload (new JS memory). Durable tombstone wins.
 await hide();await slot('pending',first.pending);await page.reload();await page.waitForFunction(async()=>!(await BBMPushNavigation.read()));assert.equal(new URL(page.url()).hash,'#mine');assert(!await page.locator('#detail').isVisible());
 // A newer slot is not removed by acknowledgement of the previous tap.
 await hide();const latest=await page.evaluate(async()=>{const a=await BBMPushNavigation.save('coffee-cinnamon'),b=await BBMPushNavigation.save('red-friday');await BBMPushNavigation.complete(a);return {expected:b.id,pending:await BBMPushNavigation.read()};});assert.equal(latest.pending.id,latest.expected);await page.evaluate(()=>BBMPushNavigation.discard('not-current'));assert.equal((await slot('pending')).id,latest.expected);await page.evaluate(id=>BBMPushNavigation.discard(id),latest.expected);
 // A pending slot is consumed after OPEN_RITUAL even if the document stayed visible.
 await page.goto(base+'/#mine');await hide();const byMessage=await click('coffee-cinnamon');await page.evaluate(intent=>{window.testVisibility='visible';navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'OPEN_RITUAL',ritualId:intent.ritualId,navigationId:intent.id}}));},byMessage.pending);await expectRitual('coffee-cinnamon');
 // Already visible and NO new lifecycle event: foreground recovery poll picks it up.
 await page.goto(base+'/#mine');await page.evaluate(()=>{window.testVisibility='visible';resumePushNavigation();});await click('red-friday');await expectRitual('red-friday');
 // 6: closed-app path keeps openWindow deep-link and consumes the same DB on boot.
 await hide();const cold=await click('coffee-cinnamon',{closed:true}),opened=cold.steps.find(s=>s.event==='openWindow');assert(opened.pending);assert.equal(opened.url,base+'/#ritual-coffee-cinnamon');await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(opened.url);await expectRitual('coffee-cinnamon');
 // Failed ack keeps pending until UI is open and retry succeeds, with no re-open.
 await page.goto(base+'/#mine');await hide();await click('red-friday');await page.evaluate(async()=>{window.testVisibility='visible';window.navigationAPI=BBMPushNavigation;window.ackSawDetail=false;window.opens=0;const original=openDetail;openDetail=function(...args){window.opens++;return original(...args);};globalThis.BBMPushNavigation={...navigationAPI,complete:async intent=>{window.ackSawDetail=currentId===intent.ritualId&&document.getElementById('detail').open;throw Error('temporary ack failure');}};await consumePendingPushNavigation();await consumePendingPushNavigation();});assert(await slot('pending'));assert(await page.evaluate(()=>ackSawDetail));assert.equal(await page.evaluate(()=>opens),1);await page.evaluate(async()=>{globalThis.BBMPushNavigation=navigationAPI;await consumePendingPushNavigation();});assert.equal(await slot('pending'),undefined);
 // IDB failure must not suppress the original best-effort delivery to the window.
 await hide();const failure=await click('coffee-cinnamon',{storageFailure:true});assert(failure.steps.some(s=>s.event==='focus'));assert.equal(failure.steps.find(s=>s.event==='message-dropped').message.navigationId,undefined);
 // Offline handoff and imported helper remain available after an offline reload.
 await context.setOffline(true);await page.goto(base+'/#mine');await page.reload();await hide();await click('coffee-cinnamon');await show();await expectRitual('coffee-cinnamon');await context.setOffline(false);assert.equal(await page.evaluate(()=>localStorage.getItem('bbm-pwa-v1')),journal);
 // Random widget: no full ritual-card/actions, bounded height, unchanged no-repeat.
 for(const large of [false,true]){
  await page.evaluate(large=>{state.settings.largeText=large;render();},large);
  for(const width of [320,375,390,430,1280]){
   await page.setViewportSize({width,height:844});await page.goto(base+'/#rituals');await page.locator('[data-action=random]').click();
   const pick=page.locator('.random-pick'),result=page.locator('.random-result');assert.equal(await page.locator('.random-box .ritual-card,.random-box [data-save],.random-box [data-done]').count(),0);
   assert.equal(await pick.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(21, 21, 21)');assert((await pick.boundingBox()).height>=44);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await result.evaluate(e=>e.scrollWidth<=e.clientWidth));
   if(width===390){assert((await page.locator('.random-box').boundingBox()).height<300);await page.locator('.random-box').screenshot({path:path.join(evidence,'random-'+(large?'large':'normal')+'.png')});}
   let previous=await result.getAttribute('data-open');for(let n=0;n<10;n++){await pick.click();const next=await result.getAttribute('data-open');assert.notEqual(next,previous);previous=next;}
   await result.click();assert.equal(await page.locator('#detailTitle').innerText(),await page.evaluate(()=>rituals.find(r=>r.id===randomId).title));await page.locator('#closeDetail').click();
  }
 }
 assert.equal(errors.length,0,errors.join('\n'));await browser.close();await new Promise(r=>server.close(r));
 console.log('PASS: actual SW/page shared IndexedDB; lost navigate/message -> visible/focus/pageshow/start/message/poll recovery; other/same ritual; TTL/unknown/durable dedup; latest-wins/ack retry; cold start; IDB failure fast path; offline and unchanged journal; compact random UI 320/375/390/430/1280 normal+large text and no-repeat.');
})().catch(error=>{console.error(error);process.exit(1)});
