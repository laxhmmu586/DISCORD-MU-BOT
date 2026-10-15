'use strict';
const Guide = require('./public/public/baggage-guide');
const clean = (v,n=500) => String(v || '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
function normalizeBags(value) {
  if(!Array.isArray(value)||!value.length||value.length>10) throw new Error('Include 1 to 10 bags.');
  return value.map((bag,index)=>{
    const color=clean(bag?.color,2),type=clean(bag?.type,3),descriptors=[...new Set(String(bag?.descriptors||'').split(',').filter(Boolean))];
    if(!Guide.colors.some(x=>x[0]===color)||!Guide.types.some(x=>x[0]===type)) throw new Error('Select a valid IATA color and type for each bag.');
    if(descriptors.length>3||descriptors.some(c=>!Guide.descriptors.some(x=>x[0]===c))) throw new Error('Select up to 3 valid descriptive elements.');
    for(const [none,group] of [['X-M','material'],['X-E','external']]) if(descriptors.includes(none)&&descriptors.some(c=>c!==none&&Guide.descriptors.find(x=>x[0]===c)?.[5]===group))throw new Error('No element cannot be combined with an element in the same group.');
    return {number:index+1,tag:clean(bag.tag,20).toUpperCase().replace(/\s+/g,''),color,type,descriptors:descriptors.join(','),description:clean(bag.description),otherFeatures:clean(bag.otherFeatures), ...(Array.isArray(bag.contentsRows) ? {contentsRows:bag.contentsRows.slice(0,30).map(item=>({category:clean(item?.category,80),description:clean(item?.description,300)})).filter(item=>item.category||item.description)} : {})};
  });
}
function normalizePassenger(value={}) {
  const passenger={passengerName:clean(value.passengerName,160),email:clean(value.email,160).toLowerCase(),phone:clean(value.phone,80),ticketNumber:clean(value.ticketNumber,80)};
  if(!passenger.passengerName||!passenger.phone||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(passenger.email))throw new Error('Valid passenger name, email and phone are required.');
  return passenger;
}
function validateBagTagPhotos(bags, attachments) {
  const seen = new Set();
  for (const bag of bags) {
    if (!bag.tag) throw new Error('Enter a tag number for every bag.');
    if (seen.has(bag.tag)) throw new Error('Each bag must have a different tag number.');
    seen.add(bag.tag);
  }
  const photos = attachments.filter(item => item.attachmentType === 'bagTag');
  if (photos.length !== bags.length || photos.some(item => !Number.isInteger(item.bagNumber) || item.bagNumber < 1 || item.bagNumber > bags.length || !String(item.mimeType).startsWith('image/'))) throw new Error('Photograph the tag for every bag.');
  for (const bag of bags) if (photos.filter(item => item.bagNumber === bag.number).length !== 1) throw new Error('Each bag must have its own tag photo.');
}
function emailSummary(record){
  const zh=record.language==='zh',label=(en,cn)=>zh?cn:en;
  const rows=[[label('Passenger','旅客'),record.passengerName],[label('Flight','航班'),(record.flightRows||[]).map(f=>`${f.flightNo} · ${f.flightDate}`).join(' / ')],[label('Case type','案件类型'),record.caseType],[label('Bags','行李件数'),record.bagIdentifications?.length||0],[label('Tag photographs','行李牌照片'),record.tagPhotoCount||0]];
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="10" style="background:#f0f6ff;border:1px solid #dce8f8;border-radius:10px;margin-bottom:24px">${rows.filter(([,value])=>value!==undefined&&value!==null&&String(value).trim()).map(([k,v])=>`<tr><td style="color:#627f9f;font-size:12px">${Guide.escape(k)}</td><td style="font-weight:700;color:#173f73;font-size:13px">${Guide.escape(v)}</td></tr>`).join('')}</table>`;
}
function emailShell({subject='',html='',text='',record={}}) {
  const escape=Guide.escape,zh=/^zh/.test(record.language||''),pick=(en,cn)=>zh?cn:en;
  const template=record.template||'',received=template==='received',transfer=template==='rushToLaxInformationEmail',pickup=template==='baggagePickupAtLaxEmail',future=template==='baggageFuturePickupAtLaxEmail';
  let title=String(subject).replace(/^(?:\[?DO NOT REPLY\]?|【?请勿回复】?)\s*[–—-]?\s*/i,'');
  if(received)title=pick('Property Irregularity Report Received','已收到您的行李事故报告');
  if(transfer)title=pick('Baggage Transfer Status Update','行李转运状态更新');
  if(pickup)title=pick('Your Baggage Is Available for Pick-Up at LAX','您的行李已可在洛杉矶机场领取');
  const subtitle=received?(record.caseType==='DPR'?pick('DPR – Damaged Baggage','DPR – 行李损坏'):pick('AHL – Delayed / Lost Baggage','AHL – 行李延误／遗失')):record.worldTracerFileNumber?`${pick('WorldTracer Case','WorldTracer 案件编号')}: ${record.worldTracerFileNumber}`:'';
  const rows=[];
  if(received)rows.push([pick('Report Type','报告类型'),record.caseType==='DPR'?pick('DPR – Damaged Baggage','DPR – 行李损坏'):pick('AHL – Delayed / Lost Baggage','AHL – 行李延误／遗失')]);
  if(record.worldTracerFileNumber)rows.push([pick('WorldTracer Case Number','WorldTracer 案件编号'),record.worldTracerFileNumber]);
  if(pickup||future){rows.push([pick('Pick-Up Location','领取地点'),'LAX TBIT, Counter A68 Office'],[pick('Pick-Up Hours','领取时间'),future?pick('8:00 AM – 2:00 PM','上午 8:00 – 下午 2:00'):pick('7:00 AM – 3:00 PM','上午 7:00 – 下午 3:00')]);if(future&&record.availableDate)rows.push([pick('Available from','可领取日期'),record.availableDate]);}
  rows.push([pick('Passenger Name','旅客姓名'),record.passengerName],[pick('Contact Phone','联系电话'),record.phoneNumber||record.phone],[pick('Bag Tag Number','行李牌号码'),record.bagTag||(record.bagIdentifications||[]).map(b=>b.tag).filter(Boolean).join(' / ')]);
  if(transfer)rows.push([pick('Current Status','当前状态'),pick('In Transfer','转运中')],[pick('Estimated Arrival at LAX','预计抵达洛杉矶日期'),record.estimatedArrivalTime]);
  for(const flight of record.formVersion>=3?[]:record.flightRows||[])rows.push([pick('Flight Number','航班号'),flight.flightNo],[pick('Travel Date','出行日期'),flight.flightDate]);
  if(!(record.flightRows||[]).length&&record.formVersion<3)rows.push([pick('Flight','航班'),record.flightRoute]);
  if(record.destinationOnBags)rows.push([pick('Final Destination','最终目的地'),record.destinationOnBags]);
  if(received&&record.caseType==='DPR')rows.push([pick('Damage Level','破损程度'),zh?({Minor:'轻微',Major:'严重',Total:'完全损坏'}[record.dprDamageLevel]||record.dprDamageLevel):record.dprDamageLevel]);
  const table=rows.filter(([,v])=>v!==undefined&&v!==null&&String(v).trim()).length?`<table role="presentation" width="100%" cellspacing="0" cellpadding="10" style="border-collapse:collapse;border:1px solid #dce7f6;margin:20px 0">${rows.filter(([,v])=>v!==undefined&&v!==null&&String(v).trim()).map(([k,v])=>`<tr><td style="width:42%;background:#f1f6fd;border:1px solid #e0eaf7;color:#6b83a4;font-size:13px">${escape(k)}</td><td style="background:#fff;border:1px solid #e0eaf7;color:#153565;font-size:13px">${escape(v)}</td></tr>`).join('')}</table>`:'';
  let content=html||String(text).split(/\n\n+/).map(p=>`<p>${escape(p).replace(/\n/g,'<br>')}</p>`).join('');
  content=content.replace(/<h2>([\s\S]*?)<\/h2>/gi,'<p style="margin:0 0 16px">$1</p>');
  // Insert the detail table after the introduction, preserving all existing wording and links.
  let inserted=false;
  content=content.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi,(whole,attrs,body)=>{
    const plain=body.replace(/<[^>]*>/g,'').trim();
    let paragraph=whole;
    if(/retain|保留|valid photo ID|身份证件|authorized representative|受委托人/i.test(plain))paragraph=`<p style="padding:14px 16px;background:#faf6eb;border-radius:6px;color:#34496a;line-height:1.7">${body}</p>`;
    else if(transfer&&/arranged for transfer|安排转运|subject to change|发生变化/i.test(plain))paragraph=`<p style="padding:14px 16px;background:#eef6ff;border-radius:6px;color:#254b82;line-height:1.7">${body}</p>`;
    if(!inserted&&!/^(?:Dear Passenger[,，:]?|尊敬的旅客[：:]?|亲爱的旅客[：:]?|您好[！!]?|您好！)$/i.test(plain)){inserted=true;return paragraph+table;}
    return paragraph;
  });
  if(!inserted)content+=table;
  return `<html><body style="margin:0;background:#f3f6fa;color:#1d355f;font-family:Arial,'Microsoft YaHei',sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 12px"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;margin:auto;background:#fff"><tr><td style="padding:26px 28px 14px;color:#aa8b50;font-size:11px;letter-spacing:3px">${pick('BAGGAGE SERVICE','行李服务')}</td></tr><tr><td style="padding:0 28px 22px;color:#102c58"><h1 style="margin:0;font-size:25px;line-height:1.3">${escape(title)}</h1>${subtitle?`<p style="margin:6px 0 0;font-size:16px">${escape(subtitle)}</p>`:''}</td></tr><tr><td style="padding:0 28px 28px;font-size:14px;line-height:1.75">${content}</td></tr></table></td></tr></table></body></html>`;
}
// Embed smaller photo previews in the PDF; the original files remain separate mail/Discord attachments.
async function prepareReportAttachments(attachments){
  const sharp=require('sharp');
  return Promise.all(attachments.map(async a=>{
    if(!String(a.mimeType).startsWith('image/'))return a;
    try{const preview=await sharp(Buffer.from(a.contentBase64,'base64')).rotate().resize({width:1000,height:750,fit:'inside',withoutEnlargement:true}).jpeg({quality:65}).toBuffer();return {...a,mimeType:'image/jpeg',contentBase64:preview.toString('base64')};}
    catch{return {...a,mimeType:'application/octet-stream'};}
  }));
}
// Reuses the server's Unicode font runs and metrics. Every block wraps and paginates.
function createPdf(record,{pdfText,pdfHelveticaTextWidth,jpegFromDataUrl}) {
  const objects=[],add=content=>{objects.push(content);return objects.length;};
  const images={};
  function image(data){const jpg=jpegFromDataUrl(data);if(!jpg)return null;const name=`Im${Object.keys(images).length+1}`;images[name]=add(`<< /Type /XObject /Subtype /Image /Width ${jpg.width} /Height ${jpg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.buffer.length} >>\nstream\n${jpg.buffer.toString('binary')}\nendstream`);return {...jpg,name};}
  const fs=require('fs'),path=require('path');
  const localImage=(kind,code)=>{const file=path.join(__dirname,'public/public/assets/baggage-guide-3d',`${kind}-${code}.jpg`);return fs.existsSync(file)?`data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`:'';};
  const logoFile=path.join(__dirname,'public/public/assets/china-eastern-report-logo.jpg');
  const logo=fs.existsSync(logoFile)?image(`data:image/jpeg;base64,${fs.readFileSync(logoFile).toString('base64')}`):null;
  const pages=[];let page,y;
  const zh=record.language==='zh',label=(en,cn)=>zh?cn:en;
  const text=(value,x,baseline,size=8.5)=>{page.push('0.08 0.19 0.35 rg',pdfText(String(value||''),x,baseline,size));};
  function newPage(){
    page=['1 1 1 rg 0 0 612 792 re f'];pages.push(page);
    text(label('PROPERTY IRREGULARITY REPORT','行李运输事故记录单'),32,759,13);
    text(`${record.caseType} · LAX · ${label('Baggage service','行李服务')}`,32,741,8.5);
    if(logo)page.push(`q 148 0 0 55 432 731 cm /${logo.name} Do Q`);
    page.push('0.1 0.4 0.8 RG 1.3 w 32 727 m 580 727 l S');
    y=709;text('laxhmmu@gmail.com',32,20,7);text(String(pages.length),570,20,7);
  }
  function ensure(height){if(y-height<36)newPage();}
  const width=(value,size)=>(String(value).match(/[\x20-\x7e]+|[^\x20-\x7e]+/g)||[]).reduce((n,run,i)=>n+(i?size*.25:0)+(/^[\x20-\x7e]+$/.test(run)?pdfHelveticaTextWidth(run,size):Array.from(run).length*size),0);
  function wrap(value,maxWidth=526,size=8.5){const lines=[];let line='';for(const ch of Array.from(String(value||''))){if(ch==='\n'||width(line+ch,size)>maxWidth){lines.push(line);line='';if(ch==='\n')continue;}line+=ch;}if(line)lines.push(line);return lines;}
  function heading(value){ensure(32);page.push('0.9 0.95 1 rg',`32 ${y-8} 548 18 re f`);text(value,40,y-2,9);y-=25;}
  function paragraph(value,size=8.5){for(const line of wrap(value,526,size)){ensure(11);text(line,40,y,size);y-=11;}y-=3;}
  function field(key,value){if(value!==undefined&&value!==null&&String(value).trim())paragraph(`${key}: ${value}`);}
  function grid(fields){
    const visible=fields.filter(([,v])=>v!==undefined&&v!==null&&String(v).trim());
    for(let i=0;i<visible.length;i+=2){const pair=visible.slice(i,i+2),lines=pair.map(([k,v])=>wrap(`${k}: ${v}`,258,8.5)),height=Math.max(...lines.map(x=>x.length))*11+5;
      if(height>600){pair.forEach(([k,v])=>field(k,v));continue;}ensure(height);lines.forEach((list,column)=>list.forEach((line,j)=>text(line,40+column*273,y-j*11,8.5)));y-=height;
    }
  }
  function drawPicture(data,x,top,maxW,maxH){const im=image(data);if(!im)return;const scale=Math.min(maxW/im.width,maxH/im.height),w=im.width*scale,h=im.height*scale;page.push(`q ${w} 0 0 ${h} ${x+(maxW-w)/2} ${top-h} cm /${im.name} Do Q`);}
  function gallery(items,height=64,columns=3){
    for(let i=0;i<items.length;i+=columns){
      const row=items.slice(i,i+columns),cell=532/row.length,captions=row.map(item=>wrap(item.caption||'',cell-10,7));
      const captionHeight=Math.max(1,...captions.map(lines=>lines.length))*9,blockHeight=height+captionHeight+14;
      ensure(blockHeight);row.forEach((item,j)=>{drawPicture(item.data,40+j*cell,y,cell-8,height);captions[j].forEach((line,k)=>text(line,42+j*cell,y-height-9-k*9,7));});y-=blockHeight;
    }
  }
  function attachmentGallery(list,height=64){
    const photos=list.filter(a=>a.mimeType==='image/jpeg');gallery(photos.map((a,i)=>({data:`data:image/jpeg;base64,${a.contentBase64}`,caption:a.attachmentType==='bagTag'&&a.bagNumber?`${label('Bag','行李')} ${a.bagNumber} · ${record.bagIdentifications?.[a.bagNumber-1]?.tag||''}`:`${i+1}. ${clean(a.filename,45)}`})),height,Math.min(3,Math.max(1,photos.length)));
    list.filter(a=>a.mimeType!=='image/jpeg').forEach(a=>field(label('Separate attachment','独立附件'),a.filename));
  }
  newPage();heading(label('1  Passenger information','1  旅客信息'));
  grid([[label('Name','姓名'),record.passengerName],[label('Email','电子邮箱'),record.email],[label('Contact number','联系电话'),record.phone],[label('Ticket','机票号码'),record.ticketNumber]]);
  heading(record.formVersion >= 3 ? label('2  Baggage tags','2  行李牌号码及照片') : label('2  Flight information','2  航班信息'));
  (record.formVersion >= 3 ? [] : record.flightRows||[]).forEach(f=>field(label('Flight / Date','航班／日期'),`${f.flightNo} · ${f.flightDate}`));
  attachmentGallery((record.reportAttachments||[]).filter(a=>a.attachmentType==='bagTag'),64);
  heading(label('3  Baggage information','3  行李信息'));
  (record.bagIdentifications||[]).forEach((bag,i)=>{
    ensure(115);field(label('Bag','行李'),`${i+1} · ${bag.tag||label('Tag photograph above','行李条照片见上方')}`);
    const codes=[['color',bag.color],['type',bag.type],...bag.descriptors.split(',').filter(Boolean).map(code=>['descriptor',code])];
    gallery(codes.map(([kind,code])=>({data:localImage(kind,code),caption:`${code.replace(/-.*/,'')} ${Guide.label((kind==='color'?Guide.colors:kind==='type'?Guide.types:Guide.descriptors).find(item=>item[0]===code),record.language)}`})),42,5);
    field(label('Description','描述'),bag.description);field(label('Other features','其他特征'),bag.otherFeatures);
    (bag.contentsRows||[]).forEach(item=>field(label('Contents','包内物品'),[item.category,item.description].filter(Boolean).join(': ')));
  });
  if(record.caseType==='AHL'){
    heading(label('4  Collection / delivery','4  领取／配送方式'));
    const Delivery=require('./public/public/pir-delivery');Delivery.fields(record,record.language).forEach(([k,v])=>field(k,v));
  }else{
    heading(label('4  Damage details','4  破损详情'));
    const areas=(record.damageAreas||[]).map(key=>({front:label('Side 1','正面'),back:label('Side 2','背面'),left:label('End 1','左侧'),right:label('End 2','右侧'),top:label('Top','顶部'),bottom:label('Bottom','底部')})[key]).join(', ');
    grid([[label('Damage level','破损程度'),zh?({Minor:'轻微',Major:'严重',Total:'完全损坏'}[record.dprDamageLevel]||record.dprDamageLevel):record.dprDamageLevel],[label('Marked views','标记视角'),areas]]);
    if(record.formVersion < 3)field(label('Damage location','破损位置'),record.dprBagInfo);field(label('Inner damage','内物破损'),record.dprInnerDamage);
    if(record.damageSketch){ensure(92);drawPicture(record.damageSketch,40,y,532,80);y-=87;}
  }
  if(record.additionalInformation)field(label('Other useful information','其他有用信息'),record.additionalInformation);
  if(record.formVersion < 3 && record.contentsRows?.length){heading(label('Contents','包内物品'));record.contentsRows.forEach(item=>paragraph([item.category,item.description].filter(Boolean).join(': ')));}
  const supporting=(record.reportAttachments||[]).filter(a=>a.attachmentType!=='bagTag');
  if(supporting.length){heading(label('5  Attachments','5  附件'));attachmentGallery(supporting,46);}
  ensure(record.passengerSignatureDataUrl?70:42);heading(label('6  Passenger signature','6  旅客签字'));field(label('Date of issue','填写日期'),record.issueDate);
  if(record.passengerSignatureDataUrl){drawPicture(record.passengerSignatureDataUrl,38,y+10,200,30);y-=33;}
  const f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const cid=add('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>');
  const f2=add(`<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [${cid} 0 R] >>`);
  const resources=`<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << ${Object.entries(images).map(([k,v])=>`/${k} ${v} 0 R`).join(' ')} >> >>`;
  const streams=pages.map(p=>{const s=p.join('\n');return add(`<< /Length ${Buffer.byteLength(s,'binary')} >>\nstream\n${s}\nendstream`);});
  const parent=objects.length+streams.length+1;
  const ids=streams.map(s=>add(`<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${s} 0 R >>`));
  const pagesId=add(`<< /Type /Pages /Kids [${ids.map(id=>`${id} 0 R`).join(' ')}] /Count ${ids.length} >>`),catalog=add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf,'binary'));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(pdf,'binary');pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(pdf,'binary');
}
module.exports={normalizeBags,emailShell,emailSummary,createPdf,prepareReportAttachments,validateBagTagPhotos,normalizePassenger};
