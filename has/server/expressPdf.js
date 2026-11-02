'use strict';
const fs=require('node:fs'),path=require('node:path');
const {PDFDocument,StandardFonts,Duplex,PrintScaling}=require('../../vendor/pdf-lib/pdf-lib');
const root=path.resolve(__dirname,'../..'),template=path.join(__dirname,'../resources/express');
async function form({eta,count}){
 const doc=await PDFDocument.load(fs.readFileSync(path.join(template,'express-connect-blank.pdf'))),page=doc.getPages()[0],font=await doc.embedFont(StandardFonts.HelveticaBold),slots=require('../resources/express/template.json');
 page.drawText(eta.form,{...slots.eta,font});page.drawText(String(count),{...slots.total,font});
 return Buffer.from(await doc.save());
}
function lines(text,font,size,width){
 const result=[];let line='';for(const word of String(text).split(/\s+/)){if(line&&font.widthOfTextAtSize(line+' '+word,size)<=width){line+=' '+word;continue;}if(line){result.push(line);line='';}for(const char of word){if(line&&font.widthOfTextAtSize(line+char,size)>width){result.push(line);line='';}line+=char;}}if(line)result.push(line);return result;
}
function fit(page,text,font,{x,y,width,height,maxSize=110,maxLines=3}){
 let size=maxSize,wrapped;for(;size>=8;size-=.5){wrapped=lines(text,font,size,width);if(wrapped.length<=maxLines&&wrapped.length*size*1.12<=height)break;}
 if(size<8)throw Object.assign(Error('This passenger text is too long to fit on one sheet.'),{status:422});
 const top=y+(height+wrapped.length*size*1.12)/2-size;
 wrapped.forEach((line,i)=>page.drawText(line,{x:x+(width-font.widthOfTextAtSize(line,size))/2,y:top-i*size*1.12,font,size}));
}
async function posters(rows){
 const doc=await PDFDocument.create();doc.setTitle('Express Connection Passenger Posters');doc.registerFontkit(require('../../vendor/fontkit/fontkit.umd.min.js'));
 const print=doc.catalog.getOrCreateViewerPreferences();print.setDuplex(Duplex.Simplex);print.setPrintScaling(PrintScaling.None);print.setPickTrayByPDFSize(true);
 const latin=await doc.embedFont(fs.readFileSync(path.join(root,'vendor/fonts/NotoSans-Bold.ttf')),{subset:true}),cjkPattern=/[\u2e80-\u9fff\uac00-\ud7af]/;
 const needsCjk=rows.some(r=>cjkPattern.test(r.name+r.destination));
 // The existing PDF renderer requires a complete CFF font for CJK glyph maps.
 const cjk=needsCjk?await doc.embedFont(fs.readFileSync(path.join(root,'vendor/fonts/NotoSansCJKsc-Regular.otf')),{subset:false}):null;
 const supported=new Map();const face=text=>{const font=cjkPattern.test(text)?cjk:latin;if(!supported.has(font))supported.set(font,new Set(font.getCharacterSet()));for(const char of text)if(!supported.get(font).has(char.codePointAt(0)))throw Object.assign(Error('Use the passenger’s passport spelling and a plain-text destination for printing.'),{status:422});return font;};
 const W=841.8898,H=595.2756,M=22;
 for(const row of rows){const page=doc.addPage([W,H]),height=(H-3*M)/2;
  fit(page,row.name,face(row.name),{x:M,y:H/2+M/2,width:W-2*M,height,maxSize:240,maxLines:1});
  fit(page,row.destination,face(row.destination),{x:M,y:M,width:W-2*M,height,maxSize:240,maxLines:1});
 }

 return Buffer.from(await doc.save());
}
module.exports={form,posters,lines};
