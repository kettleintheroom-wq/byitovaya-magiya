'use strict';
// Чистые расписания: общий файл клиента, Worker и тестов.
(()=>{
 const BASE=[
 {id:'cinnamon-thursday',label:'Коричный четверг',hint:'Среда вечером + четверг утром',ritualId:'coffee-cinnamon'},
 {id:'cinnamon-first',label:'Корица первого числа',hint:'Вечером накануне',ritualId:'cinnamon-door'},
 {id:'red-friday',label:'Красное бельё по пятницам',hint:'Пятница утром',ritualId:'red-friday'},
 {id:'newmoon',label:'Новолуние',hint:'Утром в день новолуния',ritualId:'newmoon'},
 {id:'waning',label:'Убывающая Луна',hint:'В начале фазы',ritualId:'waning'}];
 const slots=[
 {id:'cinnamon-eve',base:'cinnamon-thursday',time:'20:00',weekday:3,title:'Завтра четверг',body:'Корица дома есть?'},
 {id:'cinnamon-morning',base:'cinnamon-thursday',time:'09:00',weekday:4,title:'Сегодня кофе с корицей',body:'Кофе готов. Осталось немного корицы.'},
 {id:'first-eve',base:'cinnamon-first',time:'20:00',rule:'last',title:'Завтра первое число',body:'Проверьте запасы корицы.'},
 {id:'friday',base:'red-friday',time:'09:00',weekday:5,title:'Сегодня пятница',body:'Красное бельё знает, что делать.'},
 {id:'newmoon',base:'newmoon',time:'09:00',rule:'newmoon',title:'Новый лунный цикл',body:'Можно сформулировать намерение.'},
 {id:'waning',base:'waning',time:'10:00',rule:'waning',title:'Луна пошла на убыль',body:'Можно вместе с ней отпустить лишнее.'}];
 const formatters=new Map();
 function parts(ms,tz){if(!formatters.has(tz)){if(formatters.size>64)formatters.clear();formatters.set(tz,new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));}const p=Object.fromEntries(formatters.get(tz).formatToParts(new Date(ms)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));return {y:p.year,m:p.month,d:p.day,h:p.hour,min:p.minute,s:p.second};}
 const pad=x=>String(x).padStart(2,'0');
 const dayKey=p=>`${p.y}-${pad(p.m)}-${pad(p.d)}`;
 function addDay(p,n){const d=new Date(Date.UTC(p.y,p.m-1,p.d+n,12));return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate()};}
 function at(p,time,tz){const [h,min]=time.split(':').map(Number),target=Date.UTC(p.y,p.m-1,p.d,h,min);let x=target;for(let n=0;n<4;n++){const v=parts(x,tz),delta=target-Date.UTC(v.y,v.m-1,v.d,v.h,v.min,v.s);if(delta===0)break;x+=delta;}const candidates=[];for(const z of [x-3600000,x,x+3600000]){const q=parts(z,tz);if(dayKey(q)===dayKey(p)&&q.h===h&&q.min===min)candidates.push(z);}return candidates.length?Math.min(...candidates):null;}
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s))return false;const [y,m,d]=s.split('-').map(Number),p=addDay({y,m,d},0);return y>=2020&&y<=2100&&dayKey(p)===s;}
 const validTime=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
 function matches(slot,p,tz){const weekday=new Date(Date.UTC(p.y,p.m-1,p.d)).getUTCDay();if(slot.weekday!==undefined)return weekday===slot.weekday;if(slot.rule==='last')return addDay(p,1).d===1;const noon=new Date(at(p,'12:00',tz));if(slot.rule==='newmoon')return BBMMoon.principalOn(noon,tz)?.key==='new';if(slot.rule==='waning')return BBMMoon.moonAt(noon).key==='waning'&&BBMMoon.moonAt(new Date(at(addDay(p,-1),'12:00',tz))).key!=='waning';return true;}
 function next(slot,tz,after){const first=parts(after,tz);if(slot.type==='once'){const [y,m,d]=slot.date.split('-').map(Number),ms=at({y,m,d},slot.localTime,tz);return ms!==null&&ms>after?ms:null;}for(let n=0;n<=40;n++){const p=addDay(first,n);if(!matches(slot,p,tz))continue;const ms=at(p,slot.localTime||slot.time,tz);if(ms!==null&&ms>after)return ms;}return null;}
 globalThis.BBMPushSchedule=Object.freeze({BASE,slots,parts,dayKey,addDay,at,validDate,validTime,matches,next});
})();
