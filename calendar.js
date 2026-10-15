// Лунная основа общая с push Worker (moon-core.js).
function moonAt(d){return BBMMoon.moonAt(d)}
function principalOn(d){return BBMMoon.principalOn(d)}
function matchRule(rule,d=now){if(!rule)return false;if(rule==="thursday")return d.getDay()===4;if(rule==="friday")return d.getDay()===5;if(rule==="first")return d.getDate()===1;if(rule==="newyear")return d.getMonth()===11&&d.getDate()===31;const p=moonAt(d),pr=principalOn(d);if(rule==="waxing")return p.key==="waxing";if(rule==="waning")return p.key==="waning";if(rule==="newmoon")return pr?.key==="new";if(rule==="fullmoon")return pr?.key==="full";return false}
function applies(r,d=now){return r.time==="anytime"||(r.rule&&matchRule(r.rule,d))}

const CALENDAR_RITUAL_IDS=new Set(["coffee-cinnamon","red-friday","cinnamon-door","grapes","newmoon","fullmoon"]);
function ritualEventPriority(r){if(r.rule==="first"||r.rule==="newyear")return 100;if(r.rule==="newmoon"||r.rule==="fullmoon")return 95;if(r.id==="coffee-cinnamon"||r.id==="red-friday")return 90;return 50}
function specialForDate(d){return rituals.filter(r=>CALENDAR_RITUAL_IDS.has(r.id)&&r.rule&&matchRule(r.rule,d)).sort((a,b)=>ritualEventPriority(b)-ritualEventPriority(a)||Number(a.no)-Number(b.no))}

function scheduledForDate(d){return rituals.filter(r=>r.rule&&matchRule(r.rule,d)).sort((a,b)=>ritualEventPriority(b)-ritualEventPriority(a));}
