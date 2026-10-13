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
function fittedText(ctx,text,{x,y,width,height,size=88,minSize=30,weight=800}){
  let lines,lineHeight;
  do{ctx.font=`${weight} ${size}px Arial, Helvetica, sans-serif`;lineHeight=size*1.15;lines=cardLines(ctx,text,width);if(lines.length*lineHeight<=height)break;size-=2;}while(size>=minSize);
  // Тексты проекта помещаются без усечения. Ограничитель защищает от будущего чрезмерного контента.
  const count=Math.floor(height/lineHeight);lines.slice(0,count).forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight));
  return lines.length<=count;
}
async function createShareCard({type,date,title,text}){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Не удалось собрать картинку в этом браузере.');
  ctx.fillStyle='#f1efe9';ctx.fillRect(0,0,1080,1920);
  ctx.fillStyle=type==='done'?'#fffefa':'#ff4db8';ctx.fillRect(48,48,984,1824);
  ctx.strokeStyle='#151515';ctx.lineWidth=3;ctx.strokeRect(48,48,984,1824);
  ctx.fillStyle='#151515';ctx.textBaseline='top';ctx.font='900 46px Arial';ctx.fillText('БЫТОВАЯ',110,170);ctx.fillText('МАГИЯ',110,222);
  ctx.fillStyle='#f4cf68';ctx.beginPath();ctx.arc(921,195,30,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#151515';
  ctx.beginPath();ctx.arc(966,145,21,0,Math.PI*2);ctx.stroke();
  ctx.font='22px Courier New, monospace';ctx.fillText('КАРМАННЫЙ ОТДЕЛ ВСЕЛЕННОЙ',110,315);
  ctx.beginPath();ctx.moveTo(110,370);ctx.lineTo(970,370);ctx.stroke();
  const label=type==='done'?'ПОКОЛДОВАНО':'МАГИЧЕСКАЯ СВОДКА';
  if(type==='done'){ctx.fillStyle='#ff4db8';ctx.fillRect(100,448,270,50);ctx.fillStyle='#151515';}
  ctx.font='700 28px Courier New, monospace';ctx.fillText(label,110,460);
  ctx.font='30px Arial';ctx.fillText(new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(date),110,520);
  const headlineFits=fittedText(ctx,title,{x:110,y:650,width:860,height:490});
  const bodyFits=fittedText(ctx,text,{x:110,y:1200,width:850,height:340,size:43,minSize:24,weight:400});
  ctx.beginPath();ctx.moveTo(110,1660);ctx.lineTo(970,1660);ctx.stroke();
  ctx.font='25px Courier New, monospace';ctx.fillText('ВСЁ НЕМНОГО СТРАННО',110,1705);
  ctx.font='23px Arial';ctx.fillText('Приметы и интернет-ритуалы. Результат не гарантирован.',110,1770);
  if(!headlineFits||!bodyFits)throw new Error('Текста слишком много для картинки. Можно поделиться текстом и ссылкой.');
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось сохранить картинку. Попробуйте поделиться текстом.')),'image/png'));
}
