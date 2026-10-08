// Расчёт лунных фаз и исходные календарные правила.
/* Moon phase calculations (Jean Meeus-style approximation for principal phases) */
const RAD=Math.PI/180, sinD=x=>Math.sin(x*RAD), cosD=x=>Math.cos(x*RAD);
function dt(y){const t=y-2000;return 62.92+.32217*t+.005589*t*t}
function jd(j){return new Date((j-2440587.5)*86400000)}
function phase(k,p){
  const T=k/1236.85,T2=T*T,T3=T2*T,T4=T3*T;
  let z=2451550.09765+29.530588853*k+.0001337*T2-.000000150*T3+.00000000073*T4;
  const E=1-.002516*T-.0000074*T2;
  const M=2.5534+29.10535670*k-.0000014*T2-.00000011*T3;
  const Mp=201.5643+385.81693528*k+.0107582*T2+.00001238*T3-.000000058*T4;
  const F=160.7108+390.67050284*k-.0016118*T2-.00000227*T3+.000000011*T4;
  const O=124.7746-1.56375588*k+.0020672*T2+.00000215*T3;
  let c=0;
  if(p===0||p===.5){const n=p===0;c+=(n?-.40720:-.40614)*sinD(Mp)+(n?.17241:.17302)*E*sinD(M)+(n?.01608:.01614)*sinD(2*Mp)+(n?.01039:.01043)*sinD(2*F)+(n?.00739:.00734)*E*sinD(Mp-M)+(n?-.00514:-.00515)*E*sinD(Mp+M)+(n?.00208:.00209)*E*E*sinD(2*M)-.00111*sinD(Mp-2*F)-.00057*sinD(Mp+2*F)+.00056*E*sinD(2*Mp+M)-.00042*sinD(3*Mp)+.00042*E*sinD(M+2*F)+.00038*E*sinD(M-2*F)-.00024*E*sinD(2*Mp-M)-.00017*sinD(O)-.00007*sinD(Mp+2*M)+.00004*sinD(2*Mp-2*F)+.00004*sinD(3*M)+.00003*sinD(Mp+M-2*F)+.00003*sinD(2*Mp+2*F)-.00003*sinD(Mp+M+2*F)+.00003*sinD(Mp-M+2*F)-.00002*sinD(Mp-M-2*F)-.00002*sinD(3*Mp+M)+.00002*sinD(4*Mp)}
  else{c+=-.62801*sinD(Mp)+.17172*E*sinD(M)-.01183*E*sinD(Mp+M)+.00862*sinD(2*Mp)+.00804*sinD(2*F)+.00454*E*sinD(Mp-M)+.00204*E*E*sinD(2*M)-.00180*sinD(Mp-2*F)-.00070*sinD(Mp+2*F)-.00040*sinD(3*Mp)-.00034*E*sinD(2*Mp-M)+.00032*E*sinD(M+2*F)+.00032*E*sinD(M-2*F)-.00028*E*E*sinD(Mp+2*M)+.00027*E*sinD(2*Mp+M)-.00017*sinD(O)-.00005*sinD(Mp-M-2*F)+.00004*sinD(2*Mp+2*F)-.00004*sinD(Mp+M+2*F)+.00004*sinD(Mp-2*M)+.00003*sinD(Mp+M-2*F)+.00003*sinD(3*M)+.00002*sinD(2*Mp-2*F)+.00002*sinD(Mp-M+2*F)-.00002*sinD(3*Mp+M);const W=.00306-.00038*E*cosD(M)+.00026*cosD(Mp)-.00002*cosD(Mp-M)+.00002*cosD(Mp+M)+.00002*cosD(2*F);c+=p===.25?W:-W}
  const A=[299.77+.107408*k-.009173*T2,251.88+.016321*k,251.83+26.651886*k,349.42+36.412478*k,84.66+18.206239*k,141.74+53.303771*k,207.14+2.453732*k,154.84+7.306860*k,34.52+27.261239*k,207.19+.121824*k,291.34+1.844379*k,161.72+24.198154*k,239.56+25.513099*k,331.55+3.592518*k];
  const w=[.000325,.000165,.000164,.000126,.000110,.000062,.000060,.000056,.000047,.000042,.000040,.000037,.000035,.000023];A.forEach((a,i)=>c+=w[i]*sinD(a));z+=c;return jd(z-dt(2000+k/12.3685)/86400)
}
const defs=[{f:0,key:"new",name:"Новолуние",icon:"●",short:"нов."},{f:.25,key:"first",name:"Первая четверть",icon:"◐",short:"1/4"},{f:.5,key:"full",name:"Полнолуние",icon:"○",short:"полн."},{f:.75,key:"last",name:"Последняя четверть",icon:"◑",short:"3/4"}];
const eventCache=new Map();
function around(d){const key=`${d.getFullYear()}-${d.getMonth()}`;if(eventCache.has(key))return eventCache.get(key);const dec=d.getFullYear()+(d.getMonth()+.5)/12,n=Math.round((dec-2000)*12.3685),out=[];for(let q=n-8;q<=n+8;q++){for(const p of defs)out.push({...p,date:phase(q+p.f,p.f)})}out.sort((a,b)=>a.date-b.date);eventCache.set(key,out);return out}
function moonAt(d){const ev=around(d);let prev=ev[0];for(const e of ev){if(e.date<=d)prev=e;else break}if(prev.key==="new")return{key:"waxing",name:"Растущий серп",icon:"◔"};if(prev.key==="first")return{key:"waxing",name:"Растущая Луна",icon:"◕"};if(prev.key==="full")return{key:"waning",name:"Убывающая Луна",icon:"◖"};return{key:"waning",name:"Убывающий серп",icon:"◗"}}
function principalOn(d){return around(d).find(e=>same(e.date,d))}
function matchRule(rule,d=now){if(!rule)return false;if(rule==="thursday")return d.getDay()===4;if(rule==="friday")return d.getDay()===5;if(rule==="first")return d.getDate()===1;if(rule==="newyear")return d.getMonth()===11&&d.getDate()===31;const p=moonAt(d),pr=principalOn(d);if(rule==="waxing")return p.key==="waxing";if(rule==="waning")return p.key==="waning";if(rule==="newmoon")return pr?.key==="new";if(rule==="fullmoon")return pr?.key==="full";return false}
function applies(r,d=now){return r.time==="anytime"||(r.rule&&matchRule(r.rule,d))}

const CALENDAR_RITUAL_IDS=new Set(["coffee-cinnamon","red-friday","cinnamon-door","grapes","newmoon","fullmoon"]);
function ritualEventPriority(r){if(r.rule==="first"||r.rule==="newyear")return 100;if(r.rule==="newmoon"||r.rule==="fullmoon")return 95;if(r.id==="coffee-cinnamon"||r.id==="red-friday")return 90;return 50}
function specialForDate(d){return rituals.filter(r=>CALENDAR_RITUAL_IDS.has(r.id)&&r.rule&&matchRule(r.rule,d)).sort((a,b)=>ritualEventPriority(b)-ritualEventPriority(a)||Number(a.no)-Number(b.no))}

function scheduledForDate(d){return rituals.filter(r=>r.rule&&matchRule(r.rule,d)).sort((a,b)=>ritualEventPriority(b)-ritualEventPriority(a));}
