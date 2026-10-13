'use strict';
// PNG 1080×1920. Только локальный Canvas, системный шрифт и геометрия.
function cardLines(ctx,text,maxWidth){
  const lines=[];
  for(const paragraph of String(text).split('\n')){
    let line='';
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(ctx.measureText(word).width>maxWidth){
        if(line){lines.push(line);line='';}
        let part='';for(const char of word){if(ctx.measureText(part+char).width>maxWidth){lines.push(part);part='';}part+=char;}line=part;
      }else if(line&&ctx.measureText(line+' '+word).width>maxWidth){lines.push(line);line=word;}else line=line?line+' '+word:word;
    }
    if(line)lines.push(line);
  }
  return lines;
}
function fittedText(ctx,text,{x,y,width,height,size=100,minSize=32,weight=800}){
  for(let candidate=size;candidate>=minSize;candidate-=2){
    ctx.font=`${weight} ${candidate}px Arial, Helvetica, sans-serif`;
    const lineHeight=candidate*1.15,lines=cardLines(ctx,text,width);
    if(lines.length*lineHeight>height)continue;
    lines.forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight));
    return true;
  }
  return false;
}
function cardBrandMark(ctx,x,y,scale=1){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ctx.fillStyle='#ff4db8';ctx.beginPath();ctx.arc(0,0,34,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#5f66ff';ctx.lineWidth=7;ctx.beginPath();ctx.arc(39,-37,24,0,Math.PI*2);ctx.stroke();
  ctx.restore();
}
function cardSeal(ctx){
  ctx.save();ctx.translate(778,1570);ctx.rotate(-Math.PI/24);
  ctx.strokeStyle='#151515';ctx.lineWidth=3;
  ctx.beginPath();ctx.ellipse(0,0,190,136,0,0,Math.PI*2);ctx.stroke();
  ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,178,124,0,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#151515';ctx.textAlign='center';ctx.font='700 28px Courier New, monospace';
  ctx.fillText('БЫТОВАЯ МАГИЯ',0,-85);
  cardBrandMark(ctx,-19,-15,.8);
  ctx.strokeStyle='#151515';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-64,23);ctx.lineTo(64,23);ctx.stroke();
  ctx.fillStyle='#151515';ctx.font='700 26px Courier New, monospace';
  ctx.fillText('ПРОВЕРЕНО ВСЕЛЕННОЙ',0,36);
  ctx.restore();
}
async function createShareCard({type,date,title,text}){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Не удалось собрать картинку в этом браузере.');
  const done=type==='done',left=104,width=872;
  ctx.fillStyle='#f1efe9';ctx.fillRect(0,0,1080,1920);
  ctx.fillStyle='#fffefa';ctx.fillRect(48,48,984,1824);
  ctx.strokeStyle='#151515';ctx.lineWidth=3;ctx.strokeRect(48,48,984,1824);
  ctx.fillStyle='#151515';ctx.textBaseline='top';ctx.font='900 46px Arial, Helvetica, sans-serif';
  ctx.fillText('БЫТОВАЯ',left,166);ctx.fillText('МАГИЯ',left,218);
  cardBrandMark(ctx,899,220);
  ctx.font='26px Courier New, monospace';ctx.fillText('КАРМАННЫЙ ОТДЕЛ ВСЕЛЕННОЙ',left,310);
  ctx.beginPath();ctx.moveTo(left,368);ctx.lineTo(976,368);ctx.stroke();
  const label=done?'ПОКОЛДОВАНО':'МАГИЧЕСКАЯ СВОДКА';
  ctx.font=done?'900 70px Arial, Helvetica, sans-serif':'700 30px Courier New, monospace';
  const labelWidth=ctx.measureText(label).width;
  ctx.fillStyle='#ff4db8';ctx.fillRect(left,422,labelWidth+40,done?106:62);
  ctx.fillStyle='#151515';ctx.fillText(label,left+20,done?437:438);
  ctx.font='32px Courier New, monospace';
  ctx.fillText(new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(date),left,done?558:520);
  const headlineFits=fittedText(ctx,title,{x:left,y:650,width,height:450,size:100,minSize:44});
  ctx.fillStyle='#f4cf68';ctx.fillRect(left,1144,64,10);
  ctx.fillStyle='#151515';
  const bodyFits=fittedText(ctx,text,{x:left,y:1194,width,height:242,size:44,minSize:30,weight:400});
  ctx.font='26px Courier New, monospace';ctx.fillText('ВСЁ НЕМНОГО',left,1542);ctx.fillText('СТРАННО',left,1578);
  cardSeal(ctx);
  ctx.beginPath();ctx.moveTo(left,1732);ctx.lineTo(976,1732);ctx.stroke();
  ctx.fillStyle='#625f59';
  fittedText(ctx,'Приметы и интернет-ритуалы.\nРезультат не гарантирован.',{x:left,y:1768,width,height:86,size:30,minSize:30,weight:400});
  if(!headlineFits||!bodyFits)throw new Error('Текста слишком много для картинки. Можно поделиться текстом и ссылкой.');
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось сохранить картинку. Попробуйте поделиться текстом.')),'image/png'));
}
