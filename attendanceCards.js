const { renderPng } = require('./attendancePng');
const fs = require('node:fs');
const path = require('node:path');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
const text = (x,y,value,size=20,fill='#eef3ff',weight=400) => '<text x="'+x+'" y="'+y+'" fill="'+fill+'" font-family="Noto Sans" font-size="'+size+'" font-weight="'+weight+'">'+escape(value)+'</text>';
function wrap(value, limit=30) {
  const lines=[];
  const width = value => Array.from(value).reduce((sum,c) => sum + (/[MW@%]/.test(c) ? .95 : /[^\u0000-\u00ff]/.test(c) ? 1 : /[ilI.,' ]/.test(c) ? .3 : .57),0);
  const budget=limit*.57;
  for (const word of String(value || '').replace(/\s+/g,' ').trim().split(' ')) {
    if (!word) continue;
    const parts=[];let chunk='';
    for(const char of Array.from(word)){if(chunk && width(chunk+char)>budget){parts.push(chunk);chunk='';}chunk+=char;}
    if(chunk)parts.push(chunk);
    for(const part of parts) {
      if(lines.length && width(lines.at(-1)+' '+part)<=budget) lines[lines.length-1]+=' '+part;
      else lines.push(part);
    }
  }
  return lines.length ? lines : ['—'];
}
function icon(kind,x,y,accent) {
  const shapes={person:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/>',calendar:'<rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/>',clock:'<circle cx="12" cy="12" r="10"/><path d="M12 5v7l5 3"/>',note:'<path d="M4 3h16v14H10l-6 5Z"/>'};
  return '<circle cx="'+(x+12)+'" cy="'+(y+12)+'" r="21" fill="#10213b" fill-opacity=".8" stroke="'+accent+'" stroke-opacity=".5"/><g transform="translate('+x+' '+y+')" fill="none" stroke="'+accent+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+shapes[kind]+'</g>';
}
function luxuryTitle(late) {
  const draw=(silver,gold)=>'<text x="360" y="89" font-family="Nunito" font-size="'+(late?48:36)+'" font-weight="900" letter-spacing="-.9" fill="'+silver+'">'+(late?'Coming <tspan fill="'+gold+'">Late</tspan>':'CALL OFF / SICK')+'</text>';
  return '<g transform="translate(1 4)" opacity=".7">'+draw('#020b20','#4c321b')+'</g>'+
    '<g transform="translate(0 2)">'+draw('#7489b5','#aa742d')+'</g>'+
    '<g opacity=".22" filter="url(#titleBloom)">'+draw('#dceeff','#ffe2a0')+'</g>'+draw('url(#titleWhite)','url(#titleGold)');
}
function buildCardSvg(record) {
  const late=record.type==='late', accent=late?'#ffce57':'#ff809c';
  const arrival=record.arrivalTime ? new Date('2000-01-01T'+record.arrivalTime+':00Z').toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}) : '';
  const fields=[{label:'Employee',kind:'person',lines:wrap(record.employeeName,23)},{label:'Date',kind:'calendar',lines:[record.date]}];
  if(late) fields.push({label:'Expected arrival',kind:'clock',lines:[arrival]});
  fields.push({label:late?'Why?':'Reason',kind:'note',lines:wrap(record.reason,25)});
  if(record.note) fields.push({label:'Additional note',kind:'note',lines:wrap(record.note,25)});
  const panelHeight=fields.reduce((sum,field)=>sum+71+(field.lines.length-1)*25,0)+16;
  const height=Math.max(515,164+panelHeight+84),footerY=height-55;
  const scene=fs.readFileSync(path.join(__dirname,'public','public','assets','attendance',late?'late-luminous-v1.png':'sick-luminous-v1.png')).toString('base64');
  const sceneHeight=late?560:540;
  let content='<image x="0" y="0" width="800" height="'+sceneHeight+'" preserveAspectRatio="none" href="data:image/png;base64,'+scene+'"/>';
  content+='<rect x="0" y="'+(sceneHeight-65)+'" width="800" height="65" fill="url(#sceneFade)"/>';
  content+=luxuryTitle(late);
  content+='<path d="M540 108Q651 103 753 121" stroke="'+accent+'" stroke-width="1.8" fill="none" opacity=".85"/>';
  content+=text(362,133,'Employee Request Received',20,'#b6c7e7');
  content+='<rect x="360" y="164" width="401" height="'+panelHeight+'" rx="23" fill="#06152f" fill-opacity=".65"/><rect x="360" y="164" width="401" height="'+panelHeight+'" rx="23" fill="url(#glass)" stroke="url(#glassEdge)" stroke-width="1"/>';
  content+='<path d="M362 166H736Q657 173 590 197H362Z" fill="#c7dfff" opacity=".08"/>';
  let rowY=178;
  fields.forEach((field,index)=>{
    content+=icon(field.kind,390,rowY+17,accent)+text(436,rowY+22,field.label,15,'#a8bde2');
    field.lines.forEach((line,i)=>content+=text(436,rowY+47+i*25,line,20,'#f2f5ff',field.kind==='person'||field.kind==='calendar'||field.kind==='clock'?700:400));
    rowY+=71+(field.lines.length-1)*25;
    if(index<fields.length-1)content+='<path d="M381 '+(rowY-3)+'H741" stroke="#8baee8" stroke-opacity=".14"/>';
  });
  content+='<rect x="22" y="'+footerY+'" width="756" height="42" rx="10" fill="#07142d" fill-opacity=".6"/><path d="M44 '+footerY+'H757" stroke="'+accent+'" stroke-opacity=".4"/>';
  content+=text(755,footerY+30,'Submitted '+new Date(record.submittedAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT',16,'#c1d0e8').replace('<text ','<text text-anchor="end" ');
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="'+height+'" viewBox="0 0 800 '+height+'"><defs>'+
    '<linearGradient id="background" x2="1" y2="1"><stop stop-color="#263958"/><stop offset=".38" stop-color="#0b1b37"/><stop offset="1" stop-color="#0b1428"/></linearGradient>'+
    '<radialGradient id="artGlow"><stop stop-color="'+accent+'" stop-opacity=".24"/><stop offset="1" stop-color="'+accent+'" stop-opacity="0"/></radialGradient>'+
    '<linearGradient id="border" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+(late?'#7b571e':'#74423d')+'"/><stop offset=".12" stop-color="#fff1cf"/><stop offset=".22" stop-color="'+(late?'#b18a42':'#b98279')+'"/><stop offset=".48" stop-color="'+(late?'#73542d':'#6c3d43')+'"/><stop offset=".72" stop-color="#fce5bd"/><stop offset=".86" stop-color="'+(late?'#c89a43':'#c0877d')+'"/><stop offset="1" stop-color="#7c603a"/></linearGradient>'+
    '<linearGradient id="glass" x2="1" y2="1"><stop stop-color="#7698cb" stop-opacity=".27"/><stop offset=".5" stop-color="#071c3c" stop-opacity=".6"/><stop offset="1" stop-color="#98acd4" stop-opacity=".24"/></linearGradient>'+
    '<linearGradient id="glassEdge" x2="1" y2="1"><stop stop-color="#dce6ff" stop-opacity=".65"/><stop offset=".5" stop-color="#709ddc" stop-opacity=".2"/><stop offset="1" stop-color="'+accent+'" stop-opacity=".8"/></linearGradient>'+
    '<linearGradient id="sceneFade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0b1428" stop-opacity="0"/><stop offset="1" stop-color="#0b1428"/></linearGradient><linearGradient id="titleWhite" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".45" stop-color="#ffffff"/><stop offset=".6" stop-color="#eaf3ff"/><stop offset="1" stop-color="#adc0e4"/></linearGradient><linearGradient id="titleGold" x2="0" y2="1"><stop stop-color="#fffde4"/><stop offset=".45" stop-color="#fff0b0"/><stop offset=".7" stop-color="#dfb14e"/><stop offset="1" stop-color="#ffdf88"/></linearGradient><filter id="titleBloom" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="2"/></filter><filter id="blur" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="5"/></filter><clipPath id="clip"><rect x="7" y="7" width="786" height="'+(height-14)+'" rx="30"/></clipPath></defs>'+
    '<rect x="5" y="5" width="790" height="'+(height-10)+'" rx="32" fill="url(#background)"/>'+
    '<g clip-path="url(#clip)">'+content+'</g>'+
    '<rect x="9" y="9" width="782" height="'+(height-18)+'" rx="30" fill="none" stroke="#050d18" stroke-width="6"/>'+
    '<rect x="10" y="10" width="780" height="'+(height-20)+'" rx="30" fill="none" stroke="url(#border)" stroke-width="3"/>'+
    '<rect x="12" y="12" width="776" height="'+(height-24)+'" rx="28" fill="none" stroke="#f8e3bb" stroke-width=".65" opacity=".48"/>'+
    '<path d="M452 9.5H570M789.5 56V88" stroke="#fff7e8" stroke-width="1.4" opacity=".86"/>'+ '</svg>');
}
async function renderCards(record) {
  return [{attachment:await renderPng(buildCardSvg(record)),name:'attendance-request.png'}];
}
module.exports={renderCards,buildCardSvg};
