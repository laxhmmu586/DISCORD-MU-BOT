const { renderPng } = require('./attendancePng');
const fs = require('node:fs');
const path = require('node:path');
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
const text = (x,y,s,size=23,fill='#eaf0fa',weight=400) => `<text x="${x}" y="${y}" fill="${fill}" font-family="Noto Sans" font-size="${size}" font-weight="${weight}">${escape(s)}</text>`;
function wrap(s, length=46) { const out=[]; for(const word of String(s || '').replace(/\s+/g,' ').split(' ')){if(!out.length || out.at(-1).length+word.length+1>length)out.push(word);else out[out.length-1]+=' '+word;}return out.flatMap(line=>line.match(new RegExp(`.{1,${length}}`,'g'))||[]); }
const time = s => s ? new Date(`2000-01-01T${s}:00Z`).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}) : '';
function frame(height,accent,body){return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#182330"/><stop offset="1" stop-color="#080f17"/></linearGradient><radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".25"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><rect x="2" y="2" width="796" height="${height-4}" rx="28" fill="url(#bg)" stroke="${accent}" stroke-opacity=".8" stroke-width="2"/><ellipse cx="140" cy="100" rx="280" ry="220" fill="url(#glow)"/>${body}</svg>`);}
function icon(kind,x,y){const paths={person:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/>',calendar:'<rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/>',clock:'<circle cx="12" cy="12" r="10"/><path d="M12 5v7l5 3"/>',note:'<path d="M4 3h16v14H10l-6 5Z"/>'};return '<g transform="translate('+x+' '+y+')" fill="none" stroke="#d6e2ee" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+paths[kind]+'</g>';}
async function renderCards(record,history){
 const late=record.type==='late',accent=late?'#ffcb35':'#ff5b76',title=late?'Coming Late':'CALL OFF / SICK';
 const reason=wrap(record.reason || 'No reason provided',43),notes=wrap(record.note,66);
 const height=420+Math.max(0,reason.length-1)*28+(record.note?38+notes.length*25:0);
 const illustration=fs.readFileSync(path.join(__dirname,'public','public','assets','attendance',late?'coming-late.png':'call-off-sick.png')).toString('base64');
 let body=`<image x="22" y="85" width="196" height="220" href="data:image/png;base64,${illustration}"/>`+text(234,65,title,34,'#ffffff',700)+text(234,103,'Employee Request Received',21,'#b2c0d3')+icon('person',233,138)+text(270,159,record.employeeName.slice(0,36),27,'#ffffff',600)+icon('calendar',233,181)+text(270,203,record.date,23)+icon('clock',233,224)+text(270,246,late?`Expected arrival · ${time(record.arrivalTime)}`:'Unable to attend scheduled shift',21);
 body+=icon('note',233,270);reason.forEach((line,i)=>body+=text(270,291+i*28,line,21));
 if(record.note)notes.forEach((line,i)=>body+=text(42,330+(reason.length-1)*28+i*25,line,19,'#b2c0d3'));
 body+=`<path d="M38 ${height-91}H762" stroke="${accent}" opacity=".35"/>`+text(42,height-57,'Submitted '+new Date(record.submittedAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT',19,'#b2c0d3');
 return [{attachment:await renderPng(frame(height,accent,body)),name:'attendance-request.png'}];
}
module.exports={renderCards};
