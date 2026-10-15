const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
 const handlers={},notifications=[],opened=[],messages=[];let focus=0,windows=[];
 const box={URL,Response,Request,console,self:{location:{href:'https://pwa-prototype.byitovaya-magiya.pages.dev/sw.js',origin:'https://pwa-prototype.byitovaya-magiya.pages.dev'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(title,data)=>notifications.push({title,...data})},clients:{matchAll:async()=>windows,openWindow:async url=>opened.push(url)}}};
 vm.createContext(box);vm.runInContext(fs.readFileSync('sw.js','utf8'),box);
 async function dispatch(name,event){let done;handlers[name]({...event,waitUntil:p=>done=p});await done;}
 await dispatch('push',{data:{json:()=>({title:'Корица',body:'Кофе готов',ritualId:'coffee-cinnamon',tag:'fixed'})}});assert.equal(notifications[0].data.ritualId,'coffee-cinnamon');assert.equal(notifications[0].tag,'fixed');
 await dispatch('push',{data:{json:()=>{throw Error('broken')}}});assert.equal(notifications[1].title,'Бытовая магия');
 let closed=0;await dispatch('notificationclick',{notification:{close:()=>closed++,data:{ritualId:'coffee-cinnamon'}}});assert.equal(opened[0],'https://pwa-prototype.byitovaya-magiya.pages.dev/#ritual-coffee-cinnamon');
 windows=[{url:'https://pwa-prototype.byitovaya-magiya.pages.dev/#mine',focus:async()=>focus++,postMessage:m=>messages.push(m)}];await dispatch('notificationclick',{notification:{close:()=>closed++,data:{ritualId:'red-friday'}}});assert.equal(focus,1);assert.equal(messages[0].type,'OPEN_RITUAL');assert.equal(messages[0].ritualId,'red-friday');assert.equal(opened.length,1);
 windows=[];await dispatch('notificationclick',{notification:{close(){},data:{ritualId:'https://evil.example/'}}});assert.equal(opened[1],'https://pwa-prototype.byitovaya-magiya.pages.dev/#today');assert.equal(closed,2);
 console.log('PASS: SW valid/malformed push, closed-app deep-link, existing-window postMessage + focus, arbitrary URL rejected.');
})().catch(e=>{console.error(e);process.exit(1)});
