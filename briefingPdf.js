const {PDFDocument,StandardFonts}=require('./vendor/pdf-lib/pdf-lib');

const departureFields=require('./public/public/briefing-fields');
function reportSections(snapshot){const f={...snapshot.fields,...snapshot.assignmentLabels};if(snapshot.direction==='departure'){
 const total=departureFields.booking(f),checks=departureFields.timeChecks(require('./etabAdvisory').localDate(new Date(snapshot.generatedAt)));
 return [
 ['Flight Information',[['Flight Number',snapshot.flight],['A/C Registration',f.registration],['A/C Type',f.aircraftType],['STD',f.std],['ETD',f.etd],['Boarding Time',f.boardingTime],['Boarding Gate',f.gate]],3],
 ['PAX Booking',[...['F','J','Y'].map(c=>[c+' / Config '+(f['config'+c]||'-'),(f['booking'+c]||'0')+' + '+(f['infant'+c]||'0')+' INF']),['TTL PAX',total.pax+' + '+total.infants],['PLF',total.plf]],3],
 ['Special Information',departureFields.specials.map(([field,label])=>[label,f[field]]),4],
 ['Time Check',[['24 Hr Transit not over',checks.transit],['240 Last Day',checks.visa240],['21 YRS OLD',checks.age21]],3],
 ['Details',f.details],
 ['Counter Assignment',departureFields.counter.map(([field,label])=>[/^counterA/.test(field)?(f[field+'Number']||label)+' / '+(f[field+'Service']||''):label,f[field]]),2],
 ['Gate Assignment',departureFields.gate.map(([field,label])=>[f[field+'Label']||label,[f[field],f[field+'Time']].filter(Boolean).join(' / ')]),2],...require('./briefingImage').controlSections(snapshot).slice(1)];
 }
 return [
 ['Flight Information',[['Flight Number',snapshot.flight],['A/C Registration',f.registration],['A/C Type',f.aircraftType],['STA',f.sta],['ETA',f.eta],['Gate',f.gate],['TTL PAX',f.pax],['Crew',f.crew],['Rush Bags',f.rushBags]],3],
 ['Passenger Information',[['WCHR - Business',f.wchrBusiness],['WCHR - Economy',f.wchrEconomy],['WCHC - Business',f.wchcBusiness],['WCHC - Economy',f.wchcEconomy],['UM',f.um],['VIP / CIP',f.vip],['AVIH',f.avih]],4],
 ['Details',f.details],
 ['Team Assignment',[['Arrival Lead',f.arrivalLead],['Announcement',f.announcement],['Carousel',f.carousel],['Phone Call',f.phoneCall],['Jet-Bridge',f.jetBridge],['Finish everything',f.finishEverything],['G - Shift',f.gShift]],2],
 ['Time Record',[['Block Time',f.blockTime],['1st PAX',f.firstPax],['Last PAX',f.lastPax],['First Bag',f.firstBag],['Last Bag',f.lastBag]],5]];
}

async function buildBriefingPdf(snapshot){
 const measureDoc=await PDFDocument.create(),font=await measureDoc.embedFont(StandardFonts.Helvetica),bold=await measureDoc.embedFont(StandardFonts.HelveticaBold);
 const W=612,H=792,M=32,CW=W-2*M,ink='#14385e',blue='#0879c6',muted='#58718a',border='#d5e3ef',pale='#eef5fb';
 const pages=[];let page,y;
 const clean=value=>String(value??'').replace(/\r\n?/g,'\n').replace(/\t/g,'    ').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
 const width=(value,size=9,strong=false)=>[...clean(value)].reduce((sum,char)=>sum+(char.codePointAt(0)>126?size:(strong?bold:font).widthOfTextAtSize(char,size)),0);
 const color=hex=>hex.slice(1).match(/../g).map(part=>(parseInt(part,16)/255).toFixed(4)).join(' ');
 const literal=value=>'('+value.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')+')';
 const unicode=value=>'<'+[...Buffer.from(value,'utf16le')].reduce((out,_,i,array)=>i%2?out:out+array[i+1].toString(16).padStart(2,'0')+array[i].toString(16).padStart(2,'0'),'')+'>';
 function text(value,x,top,size=9,strong=false,tint=ink){
  const runs=clean(value).replace(/\n/g,' ').match(/[\x20-\x7e]+|[^\x20-\x7e]+/g)||[];
  for(const run of runs){const asian=run.codePointAt(0)>126;page.push(`BT ${color(tint)} rg /${asian?'F2':strong?'F3':'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(H-top-size).toFixed(2)} Tm ${asian?unicode(run):literal(run)} Tj ET`);x+=width(run,size,strong);}
 }
 function rect(x,top,w,h,fill=pale,stroke=border){page.push(`q ${color(fill)} rg ${color(stroke)} RG .5 w ${x} ${H-top-h} ${w} ${h} re B Q`);}
 function wrap(value,w,size=9){const lines=[];for(const paragraph of clean(value||'-').split('\n')){let line='';for(const char of paragraph){if(line&&width(line+char,size)>w){lines.push(line);line='';}line+=char;}lines.push(line);}return lines;}
 function start(){page=[];pages.push(page);text('HALLMARK',M,22,15,true,blue);text('AVIATION SERVICES  /  LAX - MU',M,41,6.8,false,muted);text(snapshot.direction==='departure'?'DEPARTURE BRIEFING':'ARRIVAL BRIEFING',368,25,15,true);text(snapshot.date+'  /  '+snapshot.flight,368,45,10,true);page.push(`q ${color(border)} RG .8 w ${M} ${H-62} m ${W-M} ${H-62} l S Q`);y=71;}
 function ensure(height){if(y+height>H-43){start();return true;}return false;}
 function section(title,reserve=28){ensure(20+reserve);rect(M,y,CW,18,pale,pale);text(title.toUpperCase(),M+7,y+4,8.2,true,blue);y+=23;}
 function grid(entries,columns=3){const gap=5,w=(CW-gap*(columns-1))/columns;for(let offset=0;offset<entries.length;offset+=columns){const row=entries.slice(offset,offset+columns),lines=row.map(([,value])=>wrap(value,w-14,8.7)),h=17+Math.max(...lines.map(list=>list.length))*11;ensure(h+5);row.forEach(([label],i)=>{const x=M+i*(w+gap);rect(x,y,w,h,'#fffdf0');text(label,x+7,y+4,6.8,false,muted);lines[i].forEach((line,j)=>text(line,x+7,y+15+j*11,8.7,true));});y+=h+5;}}
 function narrative(title,value){const lines=wrap(value,CW-16,8.8);section(title,Math.min(40,lines.length*12));for(const line of lines){if(ensure(13))section(title+' (continued)',13);text(line,M+8,y,8.8);y+=12;}y+=6;}
 function assignments(counter,gate){
  const gap=12,w=(CW-gap)/2,labelWidth=w*.48,valueWidth=w-labelWidth;
  const rows=Array.from({length:Math.max(counter.length,gate.length)},(_,i)=>[counter[i],gate[i]].map(entry=>entry?{label:wrap(entry[0],labelWidth-12,7),value:wrap(entry[1],valueWidth-12,8.2)}:null));
  const heights=rows.map(row=>Math.max(26,...row.filter(Boolean).map(entry=>Math.max(entry.label.length*9,entry.value.length*10)+10)));
  const heading=()=>{section('Team Assignment',35);for(const [i,label] of ['Counter','Gate'].entries()){rect(M+i*(w+gap),y,w,19,pale,pale);text(label,M+i*(w+gap)+6,y+4,8,true);}y+=24;};
  if(heights.reduce((a,b)=>a+b+4,0)+47<=H-43-71)ensure(heights.reduce((a,b)=>a+b+4,0)+47);
  heading();rows.forEach((row,index)=>{const h=heights[index];if(y+h>H-43){start();heading();}row.forEach((entry,column)=>{if(!entry)return;const x=M+column*(w+gap);rect(x,y,labelWidth,h,pale);rect(x+labelWidth,y,valueWidth,h,'#fffdf0');entry.label.forEach((line,i)=>text(line,x+6,y+(h-entry.label.length*9)/2+i*9,7,false,muted));entry.value.forEach((line,i)=>text(line,x+labelWidth+6,y+(h-entry.value.length*10)/2+i*10,8.2,true));});y+=h+4;});y+=7;
 }
 const f={...snapshot.fields,...snapshot.assignmentLabels};start();
 const sections=reportSections(snapshot);for(const [title,entries,columns] of sections){if(snapshot.direction==='departure'&&title==='Gate Assignment')continue;if(snapshot.direction==='departure'&&title==='Counter Assignment'){assignments(entries,sections.find(([name])=>name==='Gate Assignment')[1]);continue;}if(columns){section(title);grid(entries,columns);}else narrative(title,entries);}
 const stamp=new Date(snapshot.generatedAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles',hour12:false});
 pages.forEach((commands,index)=>{page=commands;text('Archived '+stamp+' PT  |  '+snapshot.generatedBy,M,H-29,6.5,false,muted);text('ID '+snapshot.id.slice(0,8)+'  |  '+(index+1)+' / '+pages.length,W-139,H-29,6.5,false,muted);});
 const objects=[],add=body=>{objects.push(body);return objects.length;};
 const f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),f3=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'),cid=add('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>'),f2=add(`<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [${cid} 0 R] >>`);
 const streams=pages.map(commands=>{const body=commands.join('\n');return add(`<< /Length ${Buffer.byteLength(body,'binary')} >>\nstream\n${body}\nendstream`);}),parent=objects.length+streams.length+1;
 const ids=streams.map(stream=>add(`<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> /Contents ${stream} 0 R >>`)),pagesId=add(`<< /Type /Pages /Kids [${ids.map(id=>`${id} 0 R`).join(' ')}] /Count ${ids.length} >>`),catalog=add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(pdf,'binary'));pdf+=`${i+1} 0 obj\n${body}\nendobj\n`;});const xref=Buffer.byteLength(pdf,'binary');pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 const doc=await PDFDocument.load(Buffer.from(pdf,'binary'));doc.setTitle(`${snapshot.direction==='departure'?'Departure':'Arrival'} Briefing ${snapshot.flight} ${snapshot.date}`);doc.setSubject('Archived operational briefing');doc.setAuthor(snapshot.generatedBy);const archive={...snapshot,fields:{...snapshot.fields}};delete archive.contacts;delete archive.fields.instructions;await doc.attach(Buffer.from(JSON.stringify(archive,null,2)),`Briefing-${snapshot.id}.json`,{mimeType:'application/json',description:'Immutable report snapshot'});return Buffer.from(await doc.save());
}
function renderBriefingReport(snapshot){
 const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),f=snapshot.fields;
 const grid=(title,entries,columns)=>`<section><h2>${escape(title)}</h2><div class="grid" style="--columns:${columns}">${entries.map(([label,value])=>`<div class="cell"><span>${escape(label)}</span><strong>${escape(value||'-')}</strong></div>`).join('')}</div></section>`;
 const assignmentTable=(counter,gate)=>'<section class="assignment-report"><h2>Team Assignment</h2><div class="assignment-columns">'+[counter,gate].map((entries,i)=>'<div><h3>'+['Counter','Gate'][i]+'</h3><table>'+entries.map(([label,value])=>'<tr><td>'+escape(label)+'</td><td><strong>'+escape(value||'-')+'</strong></td></tr>').join('')+'</table></div>').join('')+'</div></section>';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${snapshot.direction==='departure'?'Departure':'Arrival'} Briefing ${escape(snapshot.flight)} ${escape(snapshot.date)}</title><style>*{box-sizing:border-box}body{margin:0;background:#e7edf3;color:#14385e;font:13px Arial,sans-serif}.sheet{max-width:850px;margin:16px auto;padding:32px;background:white;box-shadow:0 3px 20px #24435a12}header{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #d5e3ef;padding-bottom:16px}header b{display:block;font-size:23px;color:#0879c6}header small{font-size:10px;color:#58718a}header h1{font-size:20px;margin:0 0 6px}header p{margin:0;font-weight:700}section{margin-top:14px}h2{font-size:12px;margin:0 0 7px;padding:7px;background:#eef5fb;color:#0879c6;text-transform:uppercase}.grid{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:6px}.cell{background:#fffdf0;border:1px solid #e7e4cd;padding:8px 10px;min-width:0}.cell span{display:block;font-size:10px;color:#58718a;margin-bottom:5px}.cell strong{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}.assignment-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.assignment-columns h3{font-size:12px;margin:4px 0 8px}.assignment-columns table{border-collapse:collapse;width:100%;table-layout:fixed}.assignment-columns td{border:1px solid #d5e3ef;padding:7px;font-size:10px;overflow-wrap:anywhere;white-space:pre-wrap}.assignment-columns td:first-child{background:#eef5fb;width:48%;color:#58718a}.assignment-columns td:last-child{background:#fffdf0}.assignment-columns strong{font-size:11px}.narrative{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin:0;padding:5px 9px}footer{margin-top:28px;display:flex;justify-content:space-between;gap:10px;font-size:9px;color:#58718a}@media(max-width:600px){.sheet{padding:15px;margin:0}.grid{gap:4px}.cell{padding:7px}.cell strong{font-size:11px}header{gap:10px}header b{font-size:19px}header h1{font-size:15px}.cell span{font-size:9px}}@media print{body{background:white}.sheet{box-shadow:none;margin:0;max-width:none}section{break-inside:avoid}}</style></head><body><main class="sheet"><header><div><b>HALLMARK</b><small>AVIATION SERVICES / LAX - MU</small></div><div><h1>${snapshot.direction==='departure'?'DEPARTURE':'ARRIVAL'} BRIEFING</h1><p>${escape(snapshot.date)} / ${escape(snapshot.flight)}</p></div></header>
 ${reportSections(snapshot).filter(([title])=>snapshot.direction!=='departure'||title!=='Gate Assignment').map(([title,entries,columns])=>snapshot.direction==='departure'&&title==='Counter Assignment'?assignmentTable(entries,reportSections(snapshot).find(([name])=>name==='Gate Assignment')[1]):columns?grid(title,entries,columns):`<section><h2>${escape(title)}</h2><p class="narrative">${escape(entries||'-')}</p></section>`).join('')}

 <footer><span>Archived ${escape(new Date(snapshot.generatedAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles'}))} PT / ${escape(snapshot.generatedBy)}</span><span>ID ${escape(snapshot.id.slice(0,8))}</span></footer></main></body></html>`;
}
module.exports={buildBriefingPdf,renderBriefingReport,reportSections};
