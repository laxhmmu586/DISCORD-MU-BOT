const {PDFDocument,StandardFonts,rgb}=require('./vendor/pdf-lib/pdf-lib');
const fs=require('node:fs/promises'),path=require('node:path');
const items=require('./public/public/has-pbb-data');
// A template check is true only when its recorded source confirms it. Missing legacy answers stay blank.
const ekAccount=r=>String(r.account||'').trim().toUpperCase()==='EK';
function templateChecks(r){
 const a=id=>{const q=items.find(q=>q.id===id);return r.answers?.[q?.role]?.[id]===true;},ready=role=>r.ready?.[role]===true,moving=Boolean(r.movingAt),docked=Boolean(r.dockedAt);
 // Unmapped/partially covered statements remain unchecked; no new operator questions are inferred.
 if(r.type==='departure')return [a('d1')&&a('d3'),moving&&ready('driver')&&ready('spotter'),a('d2'),ekAccount(r),a('d4'),false,moving&&ready('driver')&&ready('spotter'),false,docked,a('d11'),a('d3'),false];
 return [Boolean(r.gateConfirmedAt),a('serviceable'),a('controls'),false /* rollers are not explicitly covered by the existing roller-door check */,a('cables'),a('stand'),ready('driver')||ready('spotter'),ekAccount(r),ready('driver')&&ready('spotter'),a('stopped'),a('chocks'),a('path'),ready('spotter'),ready('spotter'),moving&&ready('spotter'),moving&&ready('driver'),a('floor'),a('crew'),a('shoe'),a('leveler'),a('canopy')];
}
async function buildHasPbbPdf(r){
 const departure=r.type==='departure',template=departure?'departure':'arrival';
 const doc=await PDFDocument.load(await fs.readFile(path.join(__dirname,'assets/has-pbb/templates',template+'-2026.pdf'))),page=doc.getPages()[0];
 const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),ink=rgb(.13,.13,.13);
 const text=(value,x,top,size=9,maxWidth=500)=>{value=String(value??'');while(size>5&&font.widthOfTextAtSize(value,size)>maxWidth)size-=.2;page.drawText(value,{x,y:792-top-size,size,font,color:ink});};
 const tick=(x,top)=>{page.drawLine({start:{x:x+1,y:792-top-5},end:{x:x+3,y:792-top-7},thickness:1,color:ink});page.drawLine({start:{x:x+3,y:792-top-7},end:{x:x+7,y:792-top-1.5},thickness:1,color:ink});};
 const logo=await doc.embedJpg(await fs.readFile(path.join(__dirname,'assets/has-pbb/templates/hallmark-logo.jpg')));
 const logoBox=departure?{x:56.25,top:19.5,width:96.75,height:98.45}:{x:36,top:0,width:92,height:73};
 page.drawRectangle({x:logoBox.x,y:792-logoBox.top-logoBox.height,width:logoBox.width,height:logoBox.height,color:rgb(1,1,1)});const dim=logo.scaleToFit(logoBox.width,logoBox.height);page.drawImage(logo,{x:logoBox.x+(logoBox.width-dim.width)/2,y:792-logoBox.top-(logoBox.height+dim.height)/2,width:dim.width,height:dim.height});
 const columns=departure?[61.7,165.6,237.9,309.9,395.5,550.5]:[36.5,175.9,261.5,335.8,415.6,575.9],top=departure?164:114;
 for(const [i,value] of [r.flightNo,r.date,r.gate,r.blockTime||''].entries())text(value,columns[i]+4,top,9,columns[i+1]-columns[i]-8);
 const bridgeX=departure?[439,476,512]:[461,496,532],bridgeTop=departure?179.5:119;
 const bi=['L1','L2','L3'].indexOf(r.bridge);if(bi>=0)page.drawEllipse({x:bridgeX[bi],y:792-bridgeTop,xScale:12,yScale:6,borderWidth:.8,borderColor:ink});
 const checks=templateChecks(r),positions=departure?[202.38,224.82,243.54,265.89,310.17,327.21,358.89,400.41,429.21,457.07,474.47,504.47]:[148.51,168.79,185.23,204.91,224.59,244.15,263.86,283.54,323.5,355.3,374.98,394.66,414.22,433.92,468.6,488.28,526.44,562.44,582.12,601.8,621.51];
 for(let i=0;i<checks.length;i++)if(checks[i])tick(departure?67.7:42.24,positions[i]);
 if(Object.values(r.evidence||{}).some(reports=>Object.keys(reports).length))text('See attached problem report(s).',departure?66:43,departure?559:652,8,480);
 for(const [i,role] of ['driver','spotter'].entries()){
  const s=r.signatures[role];if(!s)throw Error('Both signatures required');const rowTop=(departure?641:703)+i*(departure?30:24),signatureX=departure?366:385,signatureWidth=departure?174:180;
  text(s.name,departure?68:48,rowTop,9,departure?220:270);
  if(s.typedSignature)text(s.typedSignature,signatureX,rowTop,9,signatureWidth);
  for(const stroke of s.strokes||[])for(let j=1;j<stroke.length;j++)page.drawLine({start:{x:signatureX+stroke[j-1][0]*signatureWidth,y:792-rowTop-stroke[j-1][1]*(departure?13:10)},end:{x:signatureX+stroke[j][0]*signatureWidth,y:792-rowTop-stroke[j][1]*(departure?13:10)},thickness:.8,color:ink});
 }
 for(const [role,reports] of Object.entries(r.evidence||{}))for(const [itemId,report] of Object.entries(reports)){
  const detail=doc.addPage([612,792]),photo=await doc.embedJpg(Buffer.from(report.photo.split(',')[1],'base64')),size=photo.scaleToFit(520,500),safe=value=>String(value).replace(/[^\x20-\x7e]/g,'?');
  detail.drawText('NO answer - problem report',{x:36,y:750,size:17,font:bold});detail.drawText(`${role} / ${itemId} / ${report.at}`,{x:36,y:725,size:9,font});
  detail.drawText(safe(items.find(q=>q.id===itemId)?.text||itemId),{x:36,y:700,size:9,font,maxWidth:540});
  detail.drawImage(photo,{x:36+(520-size.width)/2,y:175+(500-size.height)/2,width:size.width,height:size.height});
  const reason=/[^\x20-\x7e\r\n]/.test(report.reason)?'Reason: see attached UTF-8 problem report.':'Reason: '+report.reason;const lines=reason.match(/.{1,88}/g)||[];lines.slice(0,6).forEach((line,i)=>detail.drawText(line,{x:36,y:150-i*13,size:9,font}));
  detail.drawText(report.resolvedAt?'Resolved: '+report.resolvedAt:'Unresolved',{x:36,y:45,size:9,font});
  await doc.attach(Buffer.from(report.reason,'utf8'),`problem-${role}-${itemId}.txt`,{mimeType:'text/plain',description:'Original problem explanation (UTF-8)'});
 }
 await doc.attach(Buffer.from(JSON.stringify({...r,pdfTemplate:{version:'2026-11-01',type:template,ekOnly:{checked:ekAccount(r),source:'record.account'},gateConfirmedAt:r.gateConfirmedAt||null,communicationSource:'Driver/Spotter Ready handshake',checks}},null,2)),`HAS-PBB-${r.id}-audit.json`,{mimeType:'application/json',description:'Scoped checklist, qualification, readiness and signature audit'});
 doc.setTitle(`HAS PBB ${r.station} ${r.account} ${r.date} ${r.flightNo} ${r.bridge}`);return Buffer.from(await doc.save());
}
module.exports={buildHasPbbPdf,templateChecks};
