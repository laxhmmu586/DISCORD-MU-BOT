const sharp=require('sharp');
const fields=require('./public/public/briefing-fields');
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function controlSections(snapshot){const f={...snapshot.fields,...snapshot.assignmentLabels};return [
 ['Gate Team',[['Gate Lead',f.gateLead],['Gate Assist',f.gateAssist]],2],
 ['Operational Times',fields.gateControlTimes.map(([field,label])=>[label,f[field]]),2],
 ['Final PAX Count',[...['F','J','Y','Inf'].map(c=>[c.toUpperCase(),f['gateFinal'+c]]),['TTL',String(['F','J','Y','Inf'].reduce((n,c)=>n+(Number(f['gateFinal'+c])||0),0))]],5],
 ['Delay - Boarding Announcement',Array.from({length:5},(_,i)=>[f['gateDelayTime'+(i+1)]||'Time',f['gateDelayText'+(i+1)]||'']),1]
 ];}
function renderBriefingImageSvg(snapshot,{control=snapshot.direction==='departure',photo=false}={}){
 if(photo)control=false;
 const W=1400,M=64,CW=W-2*M,parts=[];let y=64;
 const text=(value,x,top,size=23,bold=false,color='#183e65')=>parts.push(`<text x="${x}" y="${top+size}" font-family="Arial, DejaVu Sans, sans-serif" font-size="${size}" font-weight="${bold?700:400}" fill="${color}">${escape(value)}</text>`);
 const lines=(value,width,size)=>{const out=[];for(const paragraph of String(value??'').split('\n')){let line='';for(const char of paragraph){if(line.length>=Math.max(1,Math.floor(width/(size*.59)))){out.push(line);line='';}line+=char;}out.push(line);}return out;};
 if(photo){text('HALLMARK',M,y,34,true,'#0780c9');text('AVIATION SERVICES / LAX - MU',M,y+43,16,false,'#607d99');text(snapshot.direction==='departure'?'DEPARTURE BRIEFING':'ARRIVAL BRIEFING',W-560,y+5,34,true);text(snapshot.date+' / '+snapshot.flight,W-560,y+49,23,true);y+=90;parts.push(`<path d="M${M} ${y}H${W-M}" stroke="#d7e3ee"/>`);y+=20;}else{text('HALLMARK · CHINA EASTERN',M,y,19,true,'#0780c9');y+=38;text(control?'GATE LEAD CONTROL SHEET':'ARRIVAL BRIEFING',M,y,34,true);y+=54;text(`${snapshot.date}  ·  ${snapshot.flight}${control?'  ·  GATE '+(snapshot.fields.gate||''):''}`,M,y,22);y+=52;parts.push(`<path d="M${M} ${y}H${W-M}" stroke="#225c8a" stroke-width="3"/>`);y+=28;}
 function assignments(counter,gate){
  parts.push(`<rect x="${M}" y="${y}" width="${CW}" height="42" fill="#edf5fc"/>`);text('TEAM ASSIGNMENT',M+14,y+7,20,true,'#0878bb');y+=56;
  const gap=28,width=(CW-gap)/2,labelWidth=width*.48,valueWidth=width-labelWidth;
  for(const [i,label] of ['Counter','Gate'].entries()){const x=M+i*(width+gap);parts.push(`<rect x="${x}" y="${y}" width="${width}" height="38" fill="#edf5fc"/>`);text(label,x+14,y+7,20,true);}y+=50;
  for(let row=0;row<Math.max(counter.length,gate.length);row++){
   const entries=[counter[row],gate[row]].map(entry=>entry?{labels:lines(entry[0],labelWidth-28,16),values:lines(entry[1]||'-',valueWidth-28,19)}:null),height=Math.max(62,...entries.filter(Boolean).map(entry=>Math.max(entry.labels.length*24,entry.values.length*27)+24));
   entries.forEach((entry,i)=>{if(!entry)return;const x=M+i*(width+gap);parts.push(`<rect x="${x}" y="${y}" width="${labelWidth}" height="${height}" fill="#edf5fc" stroke="#d7e3ee"/><rect x="${x+labelWidth}" y="${y}" width="${valueWidth}" height="${height}" fill="#fffdf0" stroke="#d7e3ee"/>`);entry.labels.forEach((line,j)=>text(line,x+14,y+(height-entry.labels.length*24)/2+j*24,16,false,'#607d99'));entry.values.forEach((line,j)=>text(line,x+labelWidth+14,y+(height-entry.values.length*27)/2+j*27,19,true));});y+=height+10;
  }y+=14;
 }
 const sections=control?controlSections(snapshot):require('./briefingPdf').reportSections(snapshot);
 for(const [title,entries,columns] of sections.filter(([title])=>!photo||snapshot.direction!=='departure'||!['Operational Times','Final PAX Count','Delay - Boarding Announcement'].includes(title))){
  if(photo&&snapshot.direction==='departure'&&['Special Information','Gate Assignment'].includes(title))continue;
  if(photo&&snapshot.direction==='departure'&&title==='Counter Assignment'){assignments(entries,sections.find(([name])=>name==='Gate Assignment')[1]);continue;}
  if(photo&&snapshot.direction==='departure'&&title==='PAX Booking'){const {summaryLayout,summarySvg}=require('./briefingSummary'),plan=summaryLayout(snapshot),scale=CW/plan.width;parts.push('<g transform="translate('+M+' '+y+') scale('+scale+')">'+summarySvg(snapshot).replace(/^<svg[^>]*>/,'').replace('</svg>','')+'</g>');y+=plan.height*scale+24;continue;}
  parts.push(`<rect x="${M}" y="${y}" width="${CW}" height="42" rx="5" fill="#edf5fc"/>`);text(title.toUpperCase(),M+14,y+7,20,true,'#0878bb');y+=56;
  if(!columns){for(const line of lines(entries||'-',CW-30,22)){text(line,M+15,y,22);y+=31;}y+=18;continue;}
  const gap=12,width=(CW-gap*(columns-1))/columns;
  for(let offset=0;offset<entries.length;offset+=columns){const row=entries.slice(offset,offset+columns),wrapped=row.map(([,v])=>lines(v||'-',width-28,23)),labels=row.map(([label])=>lines(label,width-28,16)),labelHeight=Math.max(...labels.map(a=>a.length))*22,height=labelHeight+Math.max(...wrapped.map(a=>a.length))*31+30;
   row.forEach(([label],i)=>{const x=M+i*(width+gap);parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="#fffdf0" stroke="#d7e3ee"/>`);labels[i].forEach((line,j)=>text(line,x+14,y+10+j*22,16,false,'#607d99'));wrapped[i].forEach((line,j)=>text(line,x+14,y+14+labelHeight+j*31,23,true));});y+=height+12;
  }y+=14;
 }
 if(photo){y=Math.max(y+50,1680);}else{y+=12;text((snapshot.preview?'Preview · ':'Completed ')+new Date(snapshot.generatedAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles'})+' PT',M,y,16,false,'#68819a');y+=60;}
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}"><rect width="100%" height="100%" fill="white"/>${parts.join('')}</svg>`;
}
async function buildBriefingImage(snapshot,options){return sharp(Buffer.from(renderBriefingImageSvg(snapshot,options))).png().toBuffer();}
module.exports={buildBriefingImage,renderBriefingImageSvg,controlSections};
