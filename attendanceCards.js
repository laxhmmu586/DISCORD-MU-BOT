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
function buildCardSvg(record) {
  const late=record.type==='late', accent=late?'#ffce57':'#ff809c';
  const arrival=record.arrivalTime ? new Date('2000-01-01T'+record.arrivalTime+':00Z').toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}) : '';
  const fields=[{label:'Employee',kind:'person',lines:wrap(record.employeeName,27)},{label:'Date',kind:'calendar',lines:[record.date]}];
  if(late) fields.push({label:'Expected arrival',kind:'clock',lines:[arrival]});
  fields.push({label:late?'Why?':'Reason',kind:'note',lines:wrap(record.reason,30)});
  if(record.note) fields.push({label:'Additional note',kind:'note',lines:wrap(record.note,30)});
  const panelHeight=fields.reduce((sum,field)=>sum+71+(field.lines.length-1)*25,0)+16;
  const height=Math.max(515,164+panelHeight+84),footerY=height-55;
  const illustration=fs.readFileSync(path.join(__dirname,'public','public','assets','attendance',late?'coming-late.png':'call-off-sick.png')).toString('base64');
  const artY=late?172:190;
  let content='<ellipse cx="160" cy="305" rx="200" ry="220" fill="url(#artGlow)"/>';
  content+='<path d="M-50 350Q155 308 284 389" stroke="'+accent+'" stroke-width="9" opacity=".16" filter="url(#blur)"/><path d="M-35 344Q132 306 292 383" stroke="'+accent+'" stroke-width="2" opacity=".65"/><path d="M-50 368Q112 326 280 407" stroke="'+accent+'" stroke-width="1" opacity=".25"/>';
  content+='<image x="'+(late?18:4)+'" y="'+artY+'" width="'+(late?286:310)+'" height="'+(late?285:250)+'" href="data:image/png;base64,'+illustration+'"/>';
  content+=late?'<text x="310" y="89" fill="#ffffff" font-family="Noto Sans" font-size="43" font-weight="700">Coming <tspan fill="'+accent+'">Late</tspan></text>':text(310,89,'CALL OFF / SICK',34,'#ffffff',700);
  content+='<path d="M490 108Q601 103 713 121" stroke="'+accent+'" stroke-width="1.8" fill="none" opacity=".85"/>';
  content+=text(312,133,'Employee Request Received',20,'#b6c7e7');
  content+='<rect x="307" y="164" width="454" height="'+panelHeight+'" rx="23" fill="url(#glass)" stroke="url(#glassEdge)" stroke-width="1"/>';
  let rowY=178;
  fields.forEach((field,index)=>{
    content+=icon(field.kind,338,rowY+17,accent)+text(384,rowY+22,field.label,15,'#a8bde2');
    field.lines.forEach((line,i)=>content+=text(384,rowY+47+i*25,line,20,'#f2f5ff',field.kind==='person'||field.kind==='calendar'||field.kind==='clock'?700:400));
    rowY+=71+(field.lines.length-1)*25;
    if(index<fields.length-1)content+='<path d="M329 '+(rowY-3)+'H741" stroke="#8baee8" stroke-opacity=".14"/>';
  });
  content+='<path d="M44 '+footerY+'H757" stroke="'+accent+'" stroke-opacity=".4"/>';
  content+=text(44,footerY+30,'Submitted '+new Date(record.submittedAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT',16,'#adc2e5');
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="'+height+'" viewBox="0 0 800 '+height+'"><defs>'+
    '<linearGradient id="background" x2="1" y2="1"><stop stop-color="#263958"/><stop offset=".38" stop-color="#0b1b37"/><stop offset="1" stop-color="#0b1428"/></linearGradient>'+
    '<radialGradient id="artGlow"><stop stop-color="'+accent+'" stop-opacity=".24"/><stop offset="1" stop-color="'+accent+'" stop-opacity="0"/></radialGradient>'+
    '<linearGradient id="border" x2=".7" y2="1"><stop stop-color="#fff1bd"/><stop offset=".25" stop-color="'+accent+'"/><stop offset=".6" stop-color="#b19765"/><stop offset="1" stop-color="'+accent+'"/></linearGradient>'+
    '<linearGradient id="glass" x2="1" y2="1"><stop stop-color="#7698cb" stop-opacity=".27"/><stop offset=".5" stop-color="#071c3c" stop-opacity=".6"/><stop offset="1" stop-color="#98acd4" stop-opacity=".24"/></linearGradient>'+
    '<linearGradient id="glassEdge" x2="1" y2="1"><stop stop-color="#dce6ff" stop-opacity=".65"/><stop offset=".5" stop-color="#709ddc" stop-opacity=".2"/><stop offset="1" stop-color="'+accent+'" stop-opacity=".8"/></linearGradient>'+
    '<filter id="blur"><feGaussianBlur stdDeviation="7"/></filter><clipPath id="clip"><rect x="7" y="7" width="786" height="'+(height-14)+'" rx="30"/></clipPath></defs>'+
    '<rect x="5" y="5" width="790" height="'+(height-10)+'" rx="32" fill="url(#background)" stroke="'+accent+'" stroke-opacity=".25" stroke-width="7"/>'+
    '<g clip-path="url(#clip)"><path d="M-90 146 139 0H340L-30 245Z" fill="#4b79bc" opacity=".16"/><path d="M-80 '+(height-150)+'Q284 '+(height+50)+' 850 220L850 366Q464 '+(height+100)+' -80 '+(height-30)+'Z" fill="#234a84" opacity=".25"/><path d="M85 '+height+'Q437 '+(height-193)+' 840 89" stroke="#4b7bcc" stroke-width="53" opacity=".07"/>'+content+'</g>'+
    '<rect x="7" y="7" width="786" height="'+(height-14)+'" rx="30" fill="none" stroke="url(#border)" stroke-width="2"/></svg>');
}
async function renderCards(record) {
  return [{attachment:await renderPng(buildCardSvg(record)),name:'attendance-request.png'}];
}
module.exports={renderCards,buildCardSvg};
