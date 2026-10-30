const fs=require('node:fs/promises'),path=require('node:path');
const {PDFDocument,StandardFonts,rgb}=require('../../vendor/pdf-lib/pdf-lib');
const model=require('../public/emergency-notification-model');
async function exportPdf(values={},scope={}){
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const logo=await pdf.embedPng(await fs.readFile(path.join(require('node:path').resolve(__dirname,'../..'),'has/public/assets/pbb/hallmark-logo.png')));
 const navy=rgb(.08,.19,.34),blue=rgb(.25,.43,.64),line=rgb(.78,.84,.91);let page,y;
 const clean=value=>String(value??'').replace(/[\r\n]+/g,' ').replace(/[\u2010-\u2015]/g,'-');
 function text(value,x,top,size=10,font=regular,color=navy){page.drawText(clean(value),{x,y:top,size,font,color});}
 function wrap(value,width,size=10,font=regular){const lines=[];let current='';for(const word of clean(value).split(/\s+/)){if(font.widthOfTextAtSize((current?current+' ':'')+word,size)>width&&current){lines.push(current);current='';}for(const character of word){if(font.widthOfTextAtSize(current+character,size)>width&&current){lines.push(current);current='';}current+=character;}current+=' ';}if(current.trim())lines.push(current.trim());return lines;}
 function paragraph(value,x,top,width,size=10,font=regular){const lines=wrap(value,width,size,font);for(const [i,line] of lines.entries())text(line,x,top-i*(size+4),size,font);return top-lines.length*(size+4);}
 function header(){page=pdf.addPage([612,792]);const scale=Math.min(125/logo.width,74/logo.height);page.drawImage(logo,{x:306-logo.width*scale/2,y:700,width:logo.width*scale,height:logo.height*scale});text('SAF-ENP-001  |  Effective 1/2/2025',377,765,8,regular,blue);const title='Emergency Notification Procedure';text(title,(612-bold.widthOfTextAtSize(title,18))/2,675,18,bold);text([scope.station,scope.account].filter(Boolean).join(' / '),42,652,9,bold,blue);y=632;}
 header();
 y=paragraph('In an emergency involving fire, police activity, injury to passengers, serious injury to employees, or any other catastrophe impacting operations, notify the following departments immediately.',42,y,528,10)-5;
 y=paragraph('All BMs must update all information as part of the HAS audit.',42,y,528,10,bold)-12;
 y=paragraph('For Duty Manager / Supervisor / Customer Agents on duty',42,y,528,10,bold)-16;
 const contacts=model.normalize(values);
 for(const call of model.calls){const titleLines=wrap(call.ordinal+' CALL: '+call.title,528,10,bold),nameLines=call.name?wrap('Name: '+(contacts[call.name]||'____________________________'),528):[],phoneLines=wrap('Phone: '+(contacts[call.phone]||'____________________________'),528);const height=(titleLines.length+nameLines.length+phoneLines.length)*14+15;if(y-height<110){header();}
  y=paragraph(call.ordinal+' CALL: '+call.title,42,y,528,10,bold);if(call.name)y=paragraph('Name: '+(contacts[call.name]||'____________________________'),42,y,528);y=paragraph('Phone: '+(contacts[call.phone]||'____________________________'),42,y,528);page.drawLine({start:{x:42,y:y+5},end:{x:570,y:y+5},thickness:.6,color:line});y-=11;
 }
 if(y<108)header();
 y=paragraph('8th  Debrief all employees involved: they are NOT to talk to any media, press, newspapers, or radio representatives.',42,y-2,528,10)-8;
 paragraph('9th  The Hallmark Incident / Occurrence Report must be completed BEFORE leaving the station.',42,y,528,10);
 for(const [i,p] of pdf.getPages().entries())p.drawText('HALLMARK AVIATION SERVICES   |   Emergency Notification Procedure   |   '+(i+1)+' / '+pdf.getPageCount(),{x:42,y:25,size:8,font:regular,color:blue});
 pdf.setTitle('Emergency Notification Procedure');pdf.setAuthor('Hallmark Aviation Services');return Buffer.from(await pdf.save());
}
module.exports={exportPdf};
