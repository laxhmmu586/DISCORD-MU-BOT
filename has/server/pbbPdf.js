const {PDFDocument,StandardFonts,rgb}=require('../../vendor/pdf-lib/pdf-lib');
const fs=require('node:fs/promises'),path=require('node:path');
const items=require('../public/pbb-data'),mapping=require('../resources/pbbTemplateMap.json');
const ink=rgb(.04,.12,.26);
async function buildPbbPdf(record){
 // Load the supplied original document; all existing graphics, text and table geometry stay intact.
 const bytes=await fs.readFile(path.join(require('node:path').resolve(__dirname,'../..'),'has/public/assets/pbb',record.type+'-source.pdf'));
 const doc=await PDFDocument.load(bytes),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),pages=doc.getPages();
 const text=(page,value,x,top,width,size=9,f=font)=>{value=String(value||'');while(size>4&&f.widthOfTextAtSize(value,size)>width)size-=.25;page.drawText(value,{x,y:page.getHeight()-top,size,font:f,color:ink});};
 const header=pages[0];
 const positions=record.type==='arrival'?{flight:[28,190,124],date:[169,190,68],gate:[256,190,55],block:[329,190,63],bridge:[458,494,530]}:{flight:[43,207,130],date:[188,207,70],gate:[271,207,55],block:[344,207,69],bridge:[463,499,535]};
 for(const [key,value] of [['flight',record.flightNo],['date',record.date],['gate',record.gate],['block','']])text(header,value,...positions[key]);
 for(const bridge of record.bridges){const x=positions.bridge[Number(bridge.slice(1))-1];header.drawEllipse({x,y:792-(record.type==='arrival'?194:208),xScale:12,yScale:8,borderWidth:1,borderColor:ink});}
 let offset=0;
 for(const [pageIndex,groups] of mapping[record.type].entries()){
  for(const [index,boxes] of groups.entries()){
   const item=items[record.type][offset+index];
   const responses=new Map();for(const role of item.roles){const value=record.answers[role][item.id]||item.defaultValue;if(!['Y','N','NA'].includes(value))throw Error('Incomplete PDF checklist: '+item.id);if(!responses.has(value))responses.set(value,[]);responses.get(value).push(role);}
   for(const [value,roles] of responses){const box=boxes[['Y','N','NA'].indexOf(value)],p=pages[pageIndex];const y=792-box.top-box.h;
    p.drawLine({start:{x:box.x+1.4,y:y+box.h*.5},end:{x:box.x+box.w*.4,y:y+1.4},thickness:1.15,color:ink});
    p.drawLine({start:{x:box.x+box.w*.4,y:y+1.4},end:{x:box.x+box.w-1,y:y+box.h-1.3},thickness:1.15,color:ink});
    // Mixed answers on a shared row remain individually attributable without changing the original table.
    if(responses.size>1)text(p,roles.map(r=>r==='driver'?'D':'S').join('/'),box.x+33,box.top+7,11,5,bold);
   }
  }offset+=groups.length;
 }
 const signaturePage=pages.at(-1),arrival=record.type==='arrival';
 for(const [i,role] of ['driver','spotter'].entries()){
  const sig=record.signatures[role];if(!sig)throw Error('Both signatures required');
  const nameTop=arrival?624+i*38:669+i*30,nameX=arrival?30:42;
  text(signaturePage,sig.name,nameX,nameTop,arrival?266:271,9,bold);text(signaturePage,'EID: '+(sig.eid||'--'),nameX,nameTop+(arrival?10:7),260,6);
  const x=arrival?323:331,top=arrival?615+i*38:662+i*30,width=arrival?250:228,height=arrival?20:13;
  for(const stroke of sig.strokes)for(let n=1;n<stroke.length;n++){const a=stroke[n-1],b=stroke[n];signaturePage.drawLine({start:{x:x+a[0]*width,y:792-top-a[1]*height},end:{x:x+b[0]*width,y:792-top-b[1]*height},thickness:.85,color:ink});}
 }
 // Keep the original page layout. Detailed role answers, notes and signing times travel as a PDF attachment.
 const audit={id:record.id,type:record.type,flightNo:record.flightNo,date:record.date,gate:record.gate,blockTime:'',participants:record.participants,bridges:record.bridges,answers:record.answers,notes:record.notes,signals:record.signals,signatures:Object.fromEntries(Object.entries(record.signatures).map(([role,s])=>[role,{name:s.name,eid:s.eid,at:s.at}])),completedAt:record.completedAt};
 await doc.attach(Buffer.from(JSON.stringify(audit,null,2)),`JetBridge-${record.id}-audit.json`,{mimeType:'application/json',description:'Operator responses, notes and signature timestamps'});
 doc.setTitle(`Jet Bridge ${record.type} ${record.flightNo} ${record.date}`);doc.setSubject('Completed original Hallmark Jet Bridge checklist');
 return Buffer.from(await doc.save());
}
module.exports={buildPbbPdf};
