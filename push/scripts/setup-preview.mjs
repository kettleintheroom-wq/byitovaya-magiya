import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),cwd=path.join(root,'push');
const origin='https://pwa-prototype.byitovaya-magiya.pages.dev',name='byitovaya-magiya-push-preview',dbName=name+'-db';
const cli=path.join(cwd,'node_modules/wrangler/bin/wrangler.js'),config=path.join(cwd,'wrangler.local.json');
function run(args,{input,capture=false,base=false}={}){const r=spawnSync(process.execPath,[cli,...args,...(base?[]:['--config',config])],{cwd,encoding:'utf8',input,stdio:capture||input?['pipe','pipe','pipe']:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});if(r.status!==0){if(!input&&r.stderr)console.error(r.stderr);throw new Error('Команда Cloudflare не завершилась: '+args.slice(0,3).join(' ')+'. Настройки и ключи сохранены для повторного запуска.');}return r.stdout||'';}
function jsonOutput(s){try{return JSON.parse(s);}catch{const start=s.indexOf('[');if(start>=0)return JSON.parse(s.slice(start));throw new Error('Не удалось прочитать ответ Cloudflare');}}
async function ask(prompt){const io=readline.createInterface({input:process.stdin,output:process.stdout});try{return (await io.question(prompt)).trim();}finally{io.close();}}
try{
 if(Number(process.versions.node.split('.')[0])<22)throw new Error('Установите Node.js LTS версии 22 или новее.');
 if(!fs.existsSync(cli))throw new Error('Сначала выполните npm ci в папке push.');
 const template=JSON.parse(fs.readFileSync(path.join(cwd,'wrangler.json'),'utf8'));
 if(template.name!==name||template.vars.APP_ORIGIN!==origin||template.vars.ENVIRONMENT!=='preview')throw new Error('Конфигурация не является preview. Запуск остановлен.');
 console.log('Этот скрипт создаёт только preview Worker и preview D1 и публикует клиент в ветку Pages pwa-prototype. main не меняется.');
 console.log('Проверьте в Cloudflare → Workers & Pages → Plans: тариф Workers Free. На Paid этот скрипт запускать нельзя без отдельного согласования расходов.');
 if(await ask('Если тариф именно Workers Free, введите FREE: ')!=='FREE')throw new Error('Остановлено до создания ресурсов.');
 if(await ask('Для входа в Cloudflare открыть браузер? Введите LOGIN (или SKIP, если Wrangler уже авторизован): ')==='LOGIN')run(['login'],{base:true});
 run(['whoami'],{base:true});
 const account=await ask('Account ID нужного аккаунта из строки выше (32 символа): ');
 if(!/^[a-f0-9]{32}$/.test(account))throw new Error('Некорректный Account ID.');
 Object.assign(process.env,{CLOUDFLARE_ACCOUNT_ID:account});
 const current=fs.existsSync(config)?JSON.parse(fs.readFileSync(config,'utf8')):template;
 if(current.account_id&&current.account_id!==account)throw new Error('Существующая настройка относится к другому аккаунту. Не смешиваем ключи.');
 const databases=jsonOutput(run(['d1','list','--json'],{capture:true,base:true}));
 let db=databases.find(x=>x.name===dbName);
 if(!db){run(['d1','create',dbName],{base:true});db=jsonOutput(run(['d1','list','--json'],{capture:true,base:true})).find(x=>x.name===dbName);}
 if(!db?.uuid)throw new Error('Не удалось определить ID preview D1.');
 current.account_id=account;current.d1_databases[0].database_id=db.uuid;
 fs.writeFileSync(config,JSON.stringify(current,null,2)+'\n');
 run(['d1','migrations','apply',dbName,'--remote']);
 const deployed=run(['deploy'],{capture:true});
 const existingSecrets=jsonOutput(run(['secret','list'],{capture:true}));
 const secretDir=path.join(cwd,'.secrets');fs.mkdirSync(secretDir,{recursive:true});const secretFile=path.join(secretDir,'vapid.json');
 let keys;
 if(!fs.existsSync(secretFile)&&existingSecrets.some(s=>s.name==='VAPID_PRIVATE_KEY'))throw new Error('У Worker уже есть VAPID-ключ, а локальной копии нет. Остановлено, чтобы не менять ключи существующих подписок.');
 if(fs.existsSync(secretFile))keys=JSON.parse(fs.readFileSync(secretFile,'utf8'));else{
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),pub=pair.publicKey.export({format:'jwk'}),priv=pair.privateKey.export({format:'jwk'});
  keys={publicKey:Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,'base64url'),Buffer.from(pub.y,'base64url')]).toString('base64url'),privateKey:priv.d};
  fs.writeFileSync(secretFile,JSON.stringify(keys),{mode:0o600});
 }
 // Секреты передаются только через stdin.
 const api=deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/)?.[0];
 if(!api)throw new Error('Не удалось прочитать workers.dev URL. Включите workers.dev для аккаунта в Cloudflare и повторите запуск.');
 run(['secret','bulk'],{input:JSON.stringify({VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey})});
 fs.writeFileSync(path.join(root,'push-config.js'),`// Только preview. Секретный ключ здесь отсутствует.\nconst PUSH_CONFIG=Object.freeze(${JSON.stringify({origin,api,publicKey:'',publicKeyFromAPI:true})});\n`);
 const stage=path.join(cwd,'.deploy-preview');fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});
 // Явный allowlist: backend, тесты и локальные секреты не попадают в Pages.
 for(const file of ['index.html','app.js','app.css','rituals.js','calendar.js','moon-core.js','push-schedule.js','push-config.js','push-ui.js','push-navigation.js','model.js','storage.js','share-cards.js','sw.js','manifest.webmanifest','_headers'])fs.copyFileSync(path.join(root,file),path.join(stage,file));
 fs.cpSync(path.join(root,'icons'),path.join(stage,'icons'),{recursive:true});
 if(await ask('Опубликовать подготовленный клиент только в pwa-prototype? Введите PREVIEW: ')!=='PREVIEW')throw new Error('Worker подготовлен; клиент ещё не опубликован. Повторите скрипт для завершения.');
 run(['pages','deploy',stage,'--project-name','byitovaya-magiya','--branch','pwa-prototype','--commit-dirty=true'],{base:true});
 const result={version:'1.2.0',preview:origin,api,database:dbName,cron:'*/5 * * * *',secrets:['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY']};
 fs.writeFileSync(path.join(cwd,'deployment.local.json'),JSON.stringify(result,null,2)+'\n');
 console.log('\nГотово. Пароль и закрытый ключ в отчёт не включены.\n'+JSON.stringify(result,null,2));
 console.log('Не удаляйте push/.secrets/vapid.json: эти ключи нужны при повторной публикации. Не отправляйте этот файл в чат или GitHub.');
}catch(e){console.error('\n'+e.message);process.exitCode=1;}
