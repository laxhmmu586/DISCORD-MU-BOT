const {PDFDocument,StandardFonts,rgb}=require('./vendor/pdf-lib/pdf-lib');
const fs=require('node:fs/promises'),path=require('node:path');
const items=require('./public/public/has-pbb-data');
async function buildHasPbbPdf(r){
 const doc=await PDFDocument.create(),page=doc.addPage([612,792]);
 const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),italic=await doc.embedFont(StandardFonts.HelveticaBoldOblique);
 const ink=rgb(.13,.13,.13),rule=rgb(.65,.65,.65),shade=rgb(.94,.94,.94),x=36,width=540;
 const text=(value,tx,top,size=9,f=font,maxWidth)=>{value=String(value??'');if(maxWidth)while(size>5&&f.widthOfTextAtSize(value,size)>maxWidth)size-=.2;page.drawText(value,{x:tx,y:792-top-size,size,font:f,color:ink});};
 const line=(x1,top1,x2,top2)=>page.drawLine({start:{x:x1,y:792-top1},end:{x:x2,y:792-top2},thickness:.4,color:rule});
 const box=(top,height,fill)=>page.drawRectangle({x,y:792-top-height,width,height,borderWidth:.4,borderColor:rule,...(fill?{color:fill}:{})});
 const check=(tx,top,yes)=>{page.drawRectangle({x:tx,y:792-top-7,width:7,height:7,borderWidth:.6,borderColor:ink});if(yes){page.drawLine({start:{x:tx+1,y:792-top-4},end:{x:tx+3,y:792-top-6},thickness:.9,color:ink});page.drawLine({start:{x:tx+3,y:792-top-6},end:{x:tx+7,y:792-top},thickness:.9,color:ink});}};
 const logo=await doc.embedPng(await fs.readFile(path.join(__dirname,'public/public/assets/pbb/has-arrival-logo.png'))),dim=logo.scaleToFit(100,68);page.drawImage(logo,{x:40,y:792-72,width:dim.width,height:dim.height});
 text('Arrival Jet Bridge Checklist',255,37,14,bold);
 text('To be completed by the Jet Bridge Operator for flights requiring jet bridge movement.',36,91,9);
 text('Retain on file for 90 days as an auditable record.',36,104,9);
 const columns=[36,186,274,342,420,576],labels=['AIRLINE AND FLIGHT #','DATE','GATE','BLOCK TIME','JET BRIDGE USED (circle)'];
 box(123,36);for(let i=1;i<5;i++)line(columns[i],123,columns[i],159);
 for(let i=0;i<5;i++)text(labels[i],columns[i]+5,126,8,bold,columns[i+1]-columns[i]-10);
 for(const [i,value]of [r.flightNo,r.date,r.gate,''].entries())text(value,columns[i]+5,141,10,bold,columns[i+1]-columns[i]-10);
 for(const [i,b]of ['L1','L2','L3'].entries()){const bx=442+i*45;text(b,bx,141,10,bold);if(r.bridge===b)page.drawEllipse({x:bx+6,y:792-147,xScale:15,yScale:9,borderWidth:.8,borderColor:ink});}
 let top=159;
 const section=title=>{box(top,15,shade);text(title,42,top+2,9.5,italic);top+=15;};
 const row=(label,yes,height=18)=>{box(top,height);check(43,top+5,yes);text(label,56,top+4,9,font,512);top+=height;};
 const answer=id=>{const q=items.find(q=>q.id===id);return r.answers[q.role]?.[id]===true;};
 const question=id=>{const q=items.find(q=>q.id===id);return row(q.pdfText||q.text,answer(id));};
 section('PRE-MOVEMENT VERIFICATION');
 row(`Gate number confirmed: ${r.gate}. Driver and Spotter reported for the operation.`,!!r.signatures.driver&&!!r.signatures.spotter);
 for(const id of ['serviceable','controls','equipment','cables','stand'])question(id);
 section('READY');row('Communication established and confirmed between Driver and Spotter.',r.ready.driver===true&&r.ready.spotter===true);
 section('SAFE');for(const id of ['stopped','chocks','path'])question(id);row('Spotter verified all safety conditions and confirmed Ready to move.',r.ready.spotter===true&&!!r.signatures.spotter);
 section('GO');row('Authorization received from Spotter to begin movement.',!!r.movingAt&&!!r.signatures.spotter);row('Driver acknowledged the authorization.',!!r.movingAt&&r.ready.driver===true);
 section('JET BRIDGE MOVEMENT');question('floor');
 section('POST-DOCKING');for(const id of ['leveler','canopy','crew','shoe'])question(id);
 section('Irregularities to report on any of the above steps.');box(top,17);top+=17;
 text('In case of an accident/incident, the operator MUST remain at the scene and immediately notify Airport Authorities.',42,top+5,7.5);
 text('Initiate the Incident Checklist with the Station Regional/General Manager. For questions, contact the HQ Safety Manager.',42,top+16,7.5);top+=34;
 for(const role of ['driver','spotter']){
  const s=r.signatures[role];if(!s)throw Error('Both signatures required');box(top,30);line(326,top,326,top+30);
  text(`Jet Bridge ${role==='driver'?'Driver':'Spotter'} (Name):`,43,top+2,8);text(s.name,43,top+14,10,bold,274);text('(Signature):',332,top+2,8);
  for(const stroke of s.strokes)for(let i=1;i<stroke.length;i++)page.drawLine({start:{x:395+stroke[i-1][0]*170,y:792-top-4-stroke[i-1][1]*22},end:{x:395+stroke[i][0]*170,y:792-top-4-stroke[i][1]*22},thickness:.8,color:ink});top+=30;
 }
 text(`Station / Account: ${r.station} / ${r.account}    Driver PBB ID: ${r.signatures.driver.pbbId}    Valid through: ${r.signatures.driver.pbbExpiry}`,36,top+7,8,bold,540);
 text(`Moving: ${r.movingAt}    Docked: ${r.dockedAt}`,36,top+20,7,font,540);
 text(`Submitted: ${r.completedAt}    Record: ${r.id}`,36,top+31,7,font,540);
 text('HAS-SAF-JBA-004     EFFECTIVE 11/01/2026     AUTHOR: Q&A',36,770,7);
 await doc.attach(Buffer.from(JSON.stringify(r,null,2)),`HAS-PBB-${r.id}-audit.json`,{mimeType:'application/json',description:'Scoped checklist, qualification, readiness and signature audit'});
 doc.setTitle(`HAS PBB ${r.station} ${r.account} ${r.date} ${r.flightNo} ${r.bridge}`);return Buffer.from(await doc.save());
}
module.exports={buildHasPbbPdf};
