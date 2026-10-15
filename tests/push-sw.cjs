const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
 const handlers={},notifications=[],opened=[],messages=[],navigations=[];let focus=0,windows=[];
 const box={URL,Response,Request,console,self:{location:{href:'https://pwa-prototype.byitovaya-magiya.pages.dev/sw.js',origin:'https://pwa-prototype.byitovaya-magiya.pages.dev'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(title,data)=>notifications.push({title,...data})},clients:{matchAll:async()=>windows,openWindow:async url=>opened.push(url)}}};
 vm.createContext(box);box.importScripts=file=>vm.runInContext(fs.readFileSync(file.replace(/^\.\//,''),'utf8'),box);vm.runInContext(fs.readFileSync('sw.js','utf8'),box);
 async function dispatch(name,event){let done;handlers[name]({...event,waitUntil:p=>done=p});await done;}
 await dispatch('push',{data:{json:()=>({title:'Корица',body:'Кофе готов',ritualId:'coffee-cinnamon',tag:'fixed'})}});assert.equal(notifications[0].data.ritualId,'coffee-cinnamon');assert.equal(notifications[0].tag,'fixed');
 await dispatch('push',{data:{json:()=>{throw Error('broken')}}});assert.equal(notifications[1].title,'Бытовая магия');
 let closed=0;await dispatch('notificationclick',{notification:{close:()=>closed++,data:{ritualId:'coffee-cinnamon'}}});assert.equal(opened[0],'https://pwa-prototype.byitovaya-magiya.pages.dev/#ritual-coffee-cinnamon');
 const base='https://pwa-prototype.byitovaya-magiya.pages.dev/';
 const client={url:base+'#mine',navigate:async function(url){navigations.push(url);this.url=url;return this;},focus:async()=>focus++,postMessage:m=>messages.push(m)};
 windows=[client];await dispatch('notificationclick',{notification:{close:()=>closed++,data:{ritualId:'coffee-cinnamon'}}});assert.equal(focus,1);assert.equal(navigations[0],base+'#ritual-coffee-cinnamon');assert.equal(messages[0].type,'OPEN_RITUAL');assert.equal(messages[0].ritualId,'coffee-cinnamon');assert.equal(opened.length,1);
 // Client.url can be stale even when it contains the target hash: still navigate
 // the existing window, then synchronize; never create another window/dialog.
 await dispatch('notificationclick',{notification:{close(){},data:{ritualId:'coffee-cinnamon'}}});assert.equal(navigations.length,2);assert.equal(focus,2);
 await dispatch('notificationclick',{notification:{close(){},data:{ritualId:'red-friday'}}});assert.equal(navigations[2],base+'#ritual-red-friday');assert.equal(opened.length,1);
 // Older/missing or rejected navigate still gets message + focus, never a duplicate.
 client.navigate=async()=>{throw Error('not available')};await dispatch('notificationclick',{notification:{close(){},data:{ritualId:'coffee-cinnamon'}}});
 delete client.navigate;await dispatch('notificationclick',{notification:{close(){},data:{ritualId:'coffee-cinnamon'}}});assert.equal(focus,5);assert.equal(opened.length,1);assert.equal(messages.at(-1).ritualId,'coffee-cinnamon');
 windows=[];await dispatch('notificationclick',{notification:{close(){},data:{ritualId:'https://evil.example/'}}});assert.equal(opened[1],'https://pwa-prototype.byitovaya-magiya.pages.dev/#today');assert.equal(closed,2);
 console.log('PASS: SW valid/malformed push; closed-app deep-link; open #mine -> navigate ritual -> focus -> message; other/same ritual; missing/rejected navigate fallback; no duplicate windows; arbitrary URL rejected.');
})().catch(e=>{console.error(e);process.exit(1)});
