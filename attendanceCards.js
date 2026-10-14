const { renderPng } = require('./attendancePng');
const fs = require('node:fs');
const path = require('node:path');
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
const text = (x,y,s,size=23,fill='#eaf0fa',weight=400) => `<text x="${x}" y="${y}" fill="${fill}" font-family="Noto Sans" font-size="${size}" font-weight="${weight}">${escape(s)}</text>`;
function wrap(s, length=46) { const out=[]; for(const word of String(s || '').replace(/\s+/g,' ').split(' ')){if(!out.length || out.at(-1).length+word.length+1>length)out.push(word);else out[out.length-1]+=' '+word;}return out.flatMap(line=>line.match(new RegExp(`.{1,${length}}`,'g'))||[]); }
const time = s => s ? new Date(`2000-01-01T${s}:00Z`).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}) : '';
function frame(height,accent,body){return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#182330"/><stop offset="1" stop-color="#080f17"/></linearGradient><radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".25"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><rect x="2" y="2" width="796" height="${height-4}" rx="28" fill="url(#bg)" stroke="${accent}" stroke-opacity=".8" stroke-width="2"/><ellipse cx="140" cy="100" rx="280" ry="220" fill="url(#glow)"/>${body}</svg>`);}
async function renderCards(record,history){
 const late=record.type==='late',accent=late?'#ffcb35':'#ff5b76',title=late?'Coming Late':'Call Off / Sick';
 const reason=wrap(record.reason || 'No reason provided',43),notes=wrap(record.note,66);
 const height=420+Math.max(0,reason.length-1)*28+(record.note?38+notes.length*25:0);
 const illustration=fs.readFileSync(path.join(__dirname,'public','public','assets','attendance',late?'coming-late.png':'call-off-sick.png')).toString('base64');
 let body=`<image x="22" y="85" width="196" height="220" href="data:image/png;base64,${illustration}"/>`+text(234,65,title,34,'#ffffff',700)+text(234,103,'Employee Request Received',21,'#b2c0d3')+text(234,159,record.employeeName.slice(0,40),27,'#ffffff',600)+text(234,203,record.date,23)+text(234,246,late?`Expected arrival · ${time(record.arrivalTime)}`:'Unable to attend scheduled shift',21);
 reason.forEach((line,i)=>body+=text(234,291+i*28,line,21));
 if(record.note)notes.forEach((line,i)=>body+=text(42,330+(reason.length-1)*28+i*25,line,19,'#b2c0d3'));
 body+=`<path d="M38 ${height-91}H762" stroke="${accent}" opacity=".35"/>`+text(42,height-57,'Submitted '+new Date(record.submittedAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT',19,'#b2c0d3')+text(42,height-27,record.reference,13,'#8597ae');
 const rows=history.slice(-25),monthlyHeight=150+rows.length*43;
 let monthly=text(40,55,'Monthly Report',29,'#ffffff',700)+text(40,94,`${record.employeeName.slice(0,42)} · ${record.date.slice(0,7)} · ${history.length} request${history.length===1?'':'s'}`,19,'#b2c0d3');
 rows.forEach((r,i)=>{const y=145+i*43;monthly+=`<circle cx="50" cy="${y-7}" r="7" fill="none" stroke="#14e5ac" stroke-width="3"/>`+text(78,y,r.date,21,'#c2cede')+text(300,y,r.type==='late'?'Coming Late':'Call Off / Sick',22,r.type==='late'?'#ffcb35':'#ff5b76');});
 if(history.length>25)monthly+=text(40,monthlyHeight-18,`Showing the latest 25 of ${history.length} requests`,16,'#b2c0d3');
 const warning='<path d="M51 32 64 57H38Z" fill="#ff5576"/><path d="M51 40v7" stroke="#381222" stroke-width="3" stroke-linecap="round"/><circle cx="51" cy="52" r="1.5" fill="#381222"/>'+text(78,57,'Attendance Policy Reminder',28,'#ffffff',700)+text(40,106,'HAS Employee Handbook · 6.7.21',22,'#c7cedb')+text(40,150,'Unsatisfactory attendance, excessive absenteeism,',23)+text(40,186,'repeated tardiness.',23)+text(40,230,'Speak directly with your supervisor about your absence.',19,'#b2c0d3');
 const svgs=[frame(height,accent,body),frame(monthlyHeight,'#ffcb35',monthly),frame(267,'#ff4166',warning)];
 return Promise.all(svgs.map(async(svg,i)=>({attachment:await renderPng(svg),name:['attendance-request.png','attendance-monthly.png','attendance-policy.png'][i]})));
}
module.exports={renderCards};
