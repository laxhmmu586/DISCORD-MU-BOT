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
    return {number:index+1,tag:clean(bag.tag,20).toUpperCase(),color,type,descriptors:descriptors.join(','),description:clean(bag.description),otherFeatures:clean(bag.otherFeatures)};
  });
}
function emailSummary(record){
  const zh=record.language==='zh',label=(en,cn)=>zh?cn:en;
  const rows=[[label('Passenger','旅客'),record.passengerName],[label('Flight','航班'),(record.flightRows||[]).map(f=>`${f.flightNo} · ${f.flightDate}`).join(' / ')],[label('Case type','案件类型'),record.caseType],[label('Bags','行李件数'),record.bagIdentifications?.length||0],[label('Tag photographs','行李牌照片'),record.tagPhotoCount||0]];
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="10" style="background:#f0f6ff;border:1px solid #dce8f8;border-radius:10px;margin-bottom:24px">${rows.map(([k,v])=>`<tr><td style="color:#627f9f;font-size:12px">${Guide.escape(k)}</td><td style="font-weight:700;color:#173f73;font-size:13px">${Guide.escape(v)}</td></tr>`).join('')}</table>`;
}
function emailShell({subject='',html='',text=''}) {
  const escape=Guide.escape;
  const content=html||String(text).split(/\n\n+/).map(p=>`<p>${escape(p).replace(/\n/g,'<br>')}</p>`).join('');
  return `<html><body style="margin:0;background:#f0f5fc;color:#243c5b;font-family:Arial,'Microsoft YaHei',sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:28px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;margin:auto;background:white;border:1px solid #dae6f5;border-radius:16px;overflow:hidden"><tr><td style="padding:24px 28px;background:#123f7a;color:#fff;font-size:13px;letter-spacing:2px">BAGGAGE SERVICE</td></tr><tr><td style="padding:24px 28px 12px;font-size:23px;font-weight:700;color:#123f7a;border-bottom:1px solid #e4edf8">${escape(subject)}</td></tr><tr><td style="padding:22px 28px;font-size:14px;line-height:1.8">${content}</td></tr><tr><td style="padding:18px 28px;background:#f1f7ff;color:#667f9f;font-size:12px">China Eastern Airlines · LAX</td></tr></table></td></tr></table></body></html>`;
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
    const photos=list.filter(a=>a.mimeType==='image/jpeg');gallery(photos.map((a,i)=>({data:`data:image/jpeg;base64,${a.contentBase64}`,caption:`${i+1}. ${clean(a.filename,45)}`})),height,Math.min(3,Math.max(1,photos.length)));
    list.filter(a=>a.mimeType!=='image/jpeg').forEach(a=>field(label('Separate attachment','独立附件'),a.filename));
  }
  newPage();heading(label('1  Passenger information','1  旅客信息'));
  grid([[label('Name','姓名'),record.passengerName],[label('Email','电子邮箱'),record.email],[label('Contact number','联系电话'),record.phone],[label('Ticket','机票号码'),record.ticketNumber]]);
  heading(label('2  Flight information','2  航班信息'));
  (record.flightRows||[]).forEach(f=>field(label('Flight / Date','航班／日期'),`${f.flightNo} · ${f.flightDate}`));
  attachmentGallery((record.reportAttachments||[]).filter(a=>a.attachmentType==='bagTag'),64);
  heading(label('3  Baggage information','3  行李信息'));
  (record.bagIdentifications||[]).forEach((bag,i)=>{
    ensure(115);field(label('Bag','行李'),`${i+1} · ${bag.tag||label('Tag photograph above','行李条照片见上方')}`);
    const codes=[['color',bag.color],['type',bag.type],...bag.descriptors.split(',').filter(Boolean).map(code=>['descriptor',code])];
    gallery(codes.map(([kind,code])=>({data:localImage(kind,code),caption:`${code.replace(/-.*/,'')} ${Guide.label((kind==='color'?Guide.colors:kind==='type'?Guide.types:Guide.descriptors).find(item=>item[0]===code),record.language)}`})),42,5);
    field(label('Description','描述'),bag.description);field(label('Other features','其他特征'),bag.otherFeatures);
  });
  if(record.caseType==='AHL'){
    heading(label('4  Collection / delivery','4  领取／配送方式'));
    const Delivery=require('./public/public/pir-delivery');Delivery.fields(record,record.language).forEach(([k,v])=>field(k,v));
  }else{
    heading(label('4  Damage details','4  破损详情'));
    const areas=(record.damageAreas||[]).map(key=>({front:label('Side 1','正面'),back:label('Side 2','背面'),left:label('End 1','左侧'),right:label('End 2','右侧'),top:label('Top','顶部'),bottom:label('Bottom','底部')})[key]).join(', ');
    grid([[label('Damage level','破损程度'),zh?({Minor:'轻微',Major:'严重',Total:'完全损坏'}[record.dprDamageLevel]||record.dprDamageLevel):record.dprDamageLevel],[label('Marked views','标记视角'),areas]]);
    field(label('Damage location','破损位置'),record.dprBagInfo);field(label('Inner damage','内物破损'),record.dprInnerDamage);
    if(record.damageSketch){ensure(92);drawPicture(record.damageSketch,40,y,532,80);y-=87;}
  }
  if(record.additionalInformation)field(label('Other useful information','其他有用信息'),record.additionalInformation);
  if(record.contentsRows?.length){heading(label('Contents','包内物品'));record.contentsRows.forEach(item=>paragraph([item.category,item.description].filter(Boolean).join(': ')));}
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
module.exports={normalizeBags,emailShell,emailSummary,createPdf,prepareReportAttachments};
