const fs=require('node:fs'),path=require('node:path');
const {PDFDocument,StandardFonts,rgb}=require('./vendor/pdf-lib/pdf-lib');
async function buildUniformPdf(record){
 const doc=await PDFDocument.load(fs.readFileSync(path.join(__dirname,'assets/uniform/replacement-form.pdf')));
 const page=doc.getPages()[0],font=await doc.embedFont(StandardFonts.Helvetica);
 // Coordinates measured against the supplied original (including its nonzero MediaBox).
 const text=(value,x,top,width,size=10)=>{value=String(value??'');const fitted=Math.min(size,width/Math.max(font.widthOfTextAtSize(value,1),1));page.drawText(value,{x,y:799.92-top,size:fitted,font,color:rgb(0,0,0)});};
 text(record.date,90,137,135);text('MU',301,139,80);text('LAX',460,142,77);
 text(record.employee.name,104,159,231);text(record.employee.eid,452,160,97);text(record.employee.phone,239,192,98);
 page.drawEllipse({x:444,y:799.92-187,xScale:11,yScale:8,borderWidth:1,borderColor:rgb(0,0,0)});
 text(record.manager.name,88,211,111,9);
 const reasonX={damage:142,annual:239,size:337,account:446};text('X',reasonX[record.reason],235,10,9);
 const rows=[338,392,449,505,558,596],columns=[[145,245],[247,347],[349,449],[451,496],[499,548]];
 record.items.forEach((item,i)=>['size','pieces','order','reusable','nonReusable'].forEach((key,j)=>{if(item[key]!==''&&item[key]!==0)text(item[key],columns[j][0]+6,rows[i],columns[j][1]-columns[j][0]-12,10);}));
 if(record.tie!==''&&record.tie!=null)text(record.tie,170,619,33,10);
 if(record.scarf!==''&&record.scarf!=null)text(record.scarf,255,619,33,10);
 return Buffer.from(await doc.save());
}
module.exports={buildUniformPdf};
