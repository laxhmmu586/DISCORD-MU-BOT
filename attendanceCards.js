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
function luxuryTitle(late, nameLines) {
  const draw=(silver,gold)=>nameLines.map((line,index)=>{
    const words=line.split(' '),last=words.pop();
    return '<text x="360" y="'+(89+index*48)+'" font-family="Poppins" font-size="43" font-weight="800" letter-spacing="-1.2" fill="'+silver+'">'+escape(words.length?words.join(' ')+' ':'')+'<tspan fill="'+gold+'">'+escape(last)+'</tspan></text>';
  }).join('');
  return '<g transform="translate(0 3)" opacity=".55">'+draw('#020b20',late?'#4c321b':'#642637')+'</g>'+
    '<g transform="translate(0 1.3)">'+draw('#99adcf',late?'#b68d43':'#b54d5f')+'</g>'+
    '<g opacity=".14" filter="url(#titleBloom)">'+draw('#dceeff',late?'#ffe2a0':'#ffb9a7')+'</g>'+draw('url(#titleWhite)',late?'url(#titleGold)':'url(#titleCoral)');
}
function orbitalRim(height,late) {
  const color=late?'#ffbd36':'#ff967f',hot=late?'#fff2b5':'#ffe2cb';
  const orbit='M39 9H761A30 30 0 0 1 791 39V'+(height-39)+'A30 30 0 0 1 761 '+(height-9)+'H39A30 30 0 0 1 9 '+(height-39)+'V39A30 30 0 0 1 39 9Z';
  let out='<defs><linearGradient id="orbitEnergy" x1="0" y1="'+height+'" x2="800" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="'+hot+'"/><stop offset=".15" stop-color="'+color+'"/><stop offset=".35" stop-color="'+color+'" stop-opacity=".24"/><stop offset=".57" stop-color="'+color+'" stop-opacity=".5"/><stop offset=".78" stop-color="'+hot+'"/><stop offset="1" stop-color="'+color+'" stop-opacity=".28"/></linearGradient><linearGradient id="orbitCore" x1="0" y1="0" x2="800" y2="'+height+'" gradientUnits="userSpaceOnUse"><stop stop-color="'+hot+'"/><stop offset=".23" stop-color="#fffef4" stop-opacity=".8"/><stop offset=".43" stop-color="'+hot+'" stop-opacity="0"/><stop offset=".7" stop-color="'+hot+'" stop-opacity=".65"/><stop offset="1" stop-color="#fffef4"/></linearGradient></defs>';
  for(const [width,opacity] of [[26,.02],[18,.045],[12,.085],[7,.15],[4,.3]]) out+='<path d="'+orbit+'" fill="none" stroke="url(#orbitEnergy)" stroke-width="'+width+'" opacity="'+opacity+'"/>';
  out+='<path d="'+orbit+'" fill="none" stroke="url(#orbitEnergy)" stroke-width="2.5"/>';
  out+='<path d="'+orbit+'" fill="none" stroke="url(#orbitCore)" stroke-width="1"/>';
  return out;
}
function buildCardSvg(record) {
  const late=record.type==='late', accent=late?'#ffce57':'#ff809c';
  const arrival=record.arrivalTime ? new Date('2000-01-01T'+record.arrivalTime+':00Z').toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}) : '';
  const nameLines=wrap(record.employeeName,15),headerExtra=(nameLines.length-1)*48,panelY=164+headerExtra;
  const fields=[{label:'Request type',kind:'person',lines:[late?'Coming Late':'Call Off / Sick']},{label:'Date',kind:'calendar',lines:[record.date]}];
  if(late) fields.push({label:'Expected arrival',kind:'clock',lines:[arrival]});
  fields.push({label:late?'Why?':'Reason',kind:'note',lines:wrap(record.reason,25)});
  if(record.note) fields.push({label:'Additional note',kind:'note',lines:wrap(record.note,25)});
  const panelHeight=fields.reduce((sum,field)=>sum+71+(field.lines.length-1)*25,0)+16;
  const height=Math.max(515+headerExtra,panelY+panelHeight+84),footerY=height-55;
  const scene=fs.readFileSync(path.join(__dirname,'public','public','assets','attendance',late?'late-luminous-v1.png':'sick-luminous-v1.png')).toString('base64');
  const sceneHeight=late?560:540;
  let content='<image x="0" y="0" width="800" height="'+sceneHeight+'" preserveAspectRatio="none" href="data:image/png;base64,'+scene+'"/>';
  content+='<rect x="0" y="'+(sceneHeight-65)+'" width="800" height="65" fill="url(#sceneFade)"/>';
  content+=luxuryTitle(late,nameLines);
  content+='<g transform="translate(0 '+headerExtra+')"><path d="M512 108Q620 98 760 122Q639 104 512 108Z" fill="url(#lightTrail)" opacity=".85" filter="url(#trailHalo)"/>'+
    '<path d="M512 108Q620 99 760 122Q641 105 512 108Z" fill="url(#lightTrail)"/>'+
    '<path d="M552 106Q626 102 709 113" stroke="url(#lightCore)" stroke-width=".9" fill="none"/>'+
    '<ellipse cx="604" cy="105" rx="17" ry="1.5" fill="#fff6d8" opacity=".4" filter="url(#trailHalo)"/></g>';
  content+=text(362,133+headerExtra,'Employee Request Received',20,'#b6c7e7');
  content+='<rect x="360" y="'+panelY+'" width="401" height="'+panelHeight+'" rx="23" fill="#06152f" fill-opacity=".65"/><rect x="360" y="'+panelY+'" width="401" height="'+panelHeight+'" rx="23" fill="url(#glass)" stroke="url(#glassEdge)" stroke-width="1"/>';
  content+='<path transform="translate(0 '+headerExtra+')" d="M362 166H736Q657 173 590 197H362Z" fill="#c7dfff" opacity=".08"/>';
  let rowY=178+headerExtra;
  fields.forEach((field,index)=>{
    content+=icon(field.kind,390,rowY+17,accent)+text(436,rowY+22,field.label,15,'#a8bde2');
    field.lines.forEach((line,i)=>content+=text(436,rowY+47+i*25,line,20,index===0?accent:'#f2f5ff',field.kind==='person'||field.kind==='calendar'||field.kind==='clock'?700:400));
    rowY+=71+(field.lines.length-1)*25;
    if(index<fields.length-1)content+='<path d="M381 '+(rowY-3)+'H741" stroke="#8baee8" stroke-opacity=".14"/>';
  });
  content+='<rect x="22" y="'+footerY+'" width="756" height="42" rx="10" fill="#07142d" fill-opacity=".6"/><path d="M44 '+footerY+'H757" stroke="'+accent+'" stroke-opacity=".4"/>';
  content+=text(755,footerY+30,'Submitted '+new Date(record.submittedAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT',16,'#c1d0e8').replace('<text ','<text text-anchor="end" ');
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="'+(height+32)+'" viewBox="-16 -16 832 '+(height+32)+'"><defs>'+
    '<linearGradient id="fineGold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7d785"/><stop offset=".26" stop-color="#c99a43"/><stop offset=".5" stop-color="#fff4c0"/><stop offset=".7" stop-color="#d6aa4b"/><stop offset="1" stop-color="#ffe48a"/></linearGradient><filter id="rimHalo" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="1.8"/></filter><filter id="cornerHalo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5"/></filter><linearGradient id="lightTrail" x1="512" y1="0" x2="760" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="'+accent+'" stop-opacity="0"/><stop offset=".28" stop-color="'+accent+'" stop-opacity=".75"/><stop offset=".48" stop-color="#fff7d8"/><stop offset=".69" stop-color="'+accent+'" stop-opacity=".95"/><stop offset="1" stop-color="'+accent+'" stop-opacity="0"/></linearGradient>'+
    '<linearGradient id="lightCore" x1="552" y1="0" x2="709" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#ffffff" stop-opacity="0"/><stop offset=".4" stop-color="#fffdf1"/><stop offset="1" stop-color="#fff1ca" stop-opacity="0"/></linearGradient><filter id="trailHalo" x="-30%" y="-400%" width="160%" height="900%"><feGaussianBlur stdDeviation="2.4"/></filter>'+
    '<linearGradient id="background" x2="1" y2="1"><stop stop-color="#263958"/><stop offset=".38" stop-color="#0b1b37"/><stop offset="1" stop-color="#0b1428"/></linearGradient>'+
    '<radialGradient id="artGlow"><stop stop-color="'+accent+'" stop-opacity=".24"/><stop offset="1" stop-color="'+accent+'" stop-opacity="0"/></radialGradient>'+
    '<linearGradient id="border" x1="0" y1="0" x2="1" y2=".85"><stop stop-color="'+(late?'#c89a45':'#c78f83')+'"/><stop offset=".12" stop-color="#fff4d4"/><stop offset=".25" stop-color="'+(late?'#d2a34b':'#d6a39a')+'"/><stop offset=".39" stop-color="'+(late?'#fff0c4':'#ffe5d8')+'"/><stop offset=".55" stop-color="'+(late?'#9a743a':'#9f6b6b')+'"/><stop offset=".73" stop-color="#ffe9b1"/><stop offset=".89" stop-color="'+(late?'#e4b75c':'#e5b2a0')+'"/><stop offset="1" stop-color="#fff0c9"/></linearGradient>'+
    '<linearGradient id="rimSpecular" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff7e0" stop-opacity=".9"/><stop offset=".23" stop-color="#a07842" stop-opacity=".15"/><stop offset=".52" stop-color="#fff4d1" stop-opacity=".85"/><stop offset=".76" stop-color="#53452c" stop-opacity=".15"/><stop offset="1" stop-color="#fff8e1"/></linearGradient>'+
    '<linearGradient id="glass" x2="1" y2="1"><stop stop-color="#7698cb" stop-opacity=".27"/><stop offset=".5" stop-color="#071c3c" stop-opacity=".6"/><stop offset="1" stop-color="#98acd4" stop-opacity=".24"/></linearGradient>'+
    '<linearGradient id="glassEdge" x2="1" y2="1"><stop stop-color="#dce6ff" stop-opacity=".65"/><stop offset=".5" stop-color="#709ddc" stop-opacity=".2"/><stop offset="1" stop-color="'+accent+'" stop-opacity=".8"/></linearGradient>'+
    '<linearGradient id="sceneFade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0b1428" stop-opacity="0"/><stop offset="1" stop-color="#0b1428"/></linearGradient><linearGradient id="titleWhite" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".45" stop-color="#ffffff"/><stop offset=".6" stop-color="#eaf3ff"/><stop offset="1" stop-color="#adc0e4"/></linearGradient><linearGradient id="titleGold" x2="0" y2="1"><stop stop-color="#fffde4"/><stop offset=".45" stop-color="#fff0b0"/><stop offset=".7" stop-color="#dfb14e"/><stop offset="1" stop-color="#ffdf88"/></linearGradient><linearGradient id="titleCoral" x2="0" y2="1"><stop stop-color="#ffe0d3"/><stop offset=".4" stop-color="#ff9a8c"/><stop offset=".7" stop-color="#e7465e"/><stop offset="1" stop-color="#ff8f87"/></linearGradient><filter id="titleBloom" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="2"/></filter><filter id="blur" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="5"/></filter><clipPath id="clip"><rect x="10" y="10" width="780" height="'+(height-20)+'" rx="29"/></clipPath></defs>'+
    '<rect x="-16" y="-16" width="832" height="'+(height+32)+'" fill="#080f18"/>'+
    '<rect x="9" y="9" width="782" height="'+(height-18)+'" rx="30" fill="url(#background)"/>'+
    '<g clip-path="url(#clip)">'+content+'</g>'+
    orbitalRim(height,late)+'</svg>');
}
async function renderCards(record) {
  return [{attachment:await renderPng(buildCardSvg(record)),name:'attendance-request.png'}];
}
module.exports={renderCards,buildCardSvg};
