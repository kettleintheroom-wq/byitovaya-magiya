const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const original=fs.readFileSync('docs/original-index.html','utf8');
const old=original.slice(original.indexOf('const OR='),original.indexOf('const weekdays='));
function evaluate(s){const ctx={Date,Intl,Map,Set};vm.createContext(ctx);vm.runInContext(s,ctx);return ctx;}
const source=evaluate(old+';globalThis.data=rituals;');
const app=evaluate('const now=new Date();const same=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();'+fs.readFileSync('rituals.js','utf8')+fs.readFileSync('calendar.js','utf8')+';globalThis.data=rituals;globalThis.get=scheduledForDate;globalThis.original=specialForDate;');
assert.equal(JSON.stringify(source.data),JSON.stringify(app.data));assert.equal(app.data.length,26);assert.equal(new Set(app.data.map(r=>r.id)).size,26);
const ids=d=>app.get(d).map(r=>r.id);
for(const id of ['coffee-cinnamon','laurel-wallet','red-chandelier','cinnamon-door'])assert(ids(new Date(2026,9,1,12)).includes(id));
assert(ids(new Date(2026,9,2,12)).includes('red-friday'));assert(ids(new Date(2026,11,31,12)).includes('grapes'));
for(let i=0;i<730;i++){const d=new Date(2026,0,1+i,12);for(const r of app.original(d))assert(ids(d).includes(r.id));}
const html=fs.readFileSync('index.html','utf8'),manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
assert(html.includes('rel="manifest"'));assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./#today');
for(const icon of manifest.icons){assert(fs.existsSync(icon.src));const png=fs.readFileSync(icon.src);const [w,h]=icon.sizes.split('x').map(Number);assert.equal(png.readUInt32BE(16),w);assert.equal(png.readUInt32BE(20),h);}
assert.equal(fs.readFileSync('app.js','utf8').match(/APP_VERSION\s*=\s*'([^']+)'/)[1],fs.readFileSync('sw.js','utf8').match(/VERSION\s*=\s*'([^']+)'/)[1]);
console.log('PASS: all 26 records exactly preserved; original calendar events retained for 730 dates; combined rules, New Year, manifest paths, PNG dimensions, version agreement.');
