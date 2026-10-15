// Print ONLY our redacted diagnostics; never dump tail request headers or raw exceptions.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const config=new URL('../wrangler.local.json',import.meta.url);
if(!fs.existsSync(config))throw new Error('Запустите из копии проекта, где уже сохранён push/wrangler.local.json.');
const c=JSON.parse(fs.readFileSync(config,'utf8'));
if(c.name!=='byitovaya-magiya-push-preview'||c.vars?.ENVIRONMENT!=='preview')throw new Error('Остановлено: это не preview.');
const cli=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
const child=spawn(process.execPath,[cli,'tail',c.name,'--config',fileURLToPath(config),'--format','json'],{stdio:['inherit','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
console.log('Подключаемся к preview tail. После подключения нажмите «Отправить тестовый push» на iPhone.');
console.log('Выводятся только очищенные PUSH_PREVIEW_DIAGNOSTIC. Остановка: Ctrl+C.');
let buffer='',record=[];
child.stdout.on('data',chunk=>{
 buffer+=chunk;
 // Accept both compact and pretty-printed tail JSON, ignoring banners.
 let end;
 while((end=buffer.indexOf('\n'))>=0){
  const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
  if(!record.length&&!line.startsWith('{')){
   if(line.startsWith('Connected to '))console.log('Tail подключён. Можно нажимать кнопку на iPhone.');
   continue;
  }
  record.push(line);
  if(record.join('').length>1000000){record=[];continue;}
  let event;try{event=JSON.parse(record.join('\n'));}catch{continue;}record=[];
  for(const log of event.logs||[])for(const message of log.message||[]){
   if(typeof message==='string'&&message.startsWith('PUSH_PREVIEW_DIAGNOSTIC '))console.log(message);
  }
 }
});
// stderr may contain account/runtime detail; do not relay it into a shareable log.
child.stderr.resume();
child.on('error',()=>console.error('Не удалось запустить Wrangler. Проверьте npm ci и авторизацию.'));
child.on('exit',code=>{if(code)console.error('Tail остановлен с кодом '+code+'. Проверьте wrangler whoami в своём терминале.');process.exitCode=code||0;});
process.on('SIGINT',()=>child.kill('SIGINT'));
