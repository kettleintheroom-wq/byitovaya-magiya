// Проверяет, что checkout ветки содержит законченный статический preview-клиент.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8'),sw=fs.readFileSync('sw.js','utf8'),html=fs.readFileSync('index.html','utf8');
const appVersion=app.match(/APP_VERSION='([^']+)'/)[1],swVersion=sw.match(/const VERSION = '([^']+)'/)[1];
assert.equal(appVersion,swVersion,'APP_VERSION и SW VERSION должны совпадать');
const box={};vm.createContext(box);vm.runInContext(fs.readFileSync('push-config.js','utf8')+';globalThis.config=PUSH_CONFIG;',box);const c=box.config;
assert.equal(c.origin,'https://pwa-prototype.byitovaya-magiya.pages.dev');
assert.equal(c.api,'https://byitovaya-magiya-push-preview.kettleintheroom.workers.dev');
assert(c.publicKey||c.publicKeyFromAPI===true,'GitHub checkout должен содержать способ получить публичный VAPID-ключ');
for(const [,src] of html.matchAll(/<script defer src="\.\/([^"]+)"/g)){assert(fs.existsSync(src),'Нет '+src);assert(sw.includes("'./"+src+"'"),'Нет precache для '+src);}
assert(!fs.existsSync('wrangler.json'),'Корень Pages не должен использовать Worker-конфигурацию');
console.log('PASS: source checkout '+appVersion+' has configured preview API/key discovery, matching SW version and all client scripts in precache.');
