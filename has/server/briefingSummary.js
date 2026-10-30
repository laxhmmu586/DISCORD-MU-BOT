const fields=require('../public/briefing-fields');
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Shared drawing plan keeps PDF, report preview and downloaded PNG in sync.
function summaryLayout(snapshot){
 const f=snapshot.fields,total=fields.booking(f),specials=fields.specialInformation(f,'departure'),commands=[],width=548,panel=262,gap=24;
 const rect=(x,y,w,h,fill='#fffdf0',stroke='#d5e3ef')=>commands.push({kind:'rect',x,y,w,h,fill,stroke});
 const text=(value,x,y,size=9,bold=false,color='#14385e')=>commands.push({kind:'text',value:String(value??''),x,y,size,bold,color});
 const wrap=(value,w,size)=>{const result=[];for(const para of String(value||'-').split('\n')){let line='',used=0;for(const ch of para){const n=size*(ch.codePointAt(0)>255?1:.62);if(line&&used+n>w){result.push(line);line='';used=0;}line+=ch;used+=n;}result.push(line);}return result;};
 const heading=(title,x)=>{rect(x,0,panel,18,'#eef5fb','#eef5fb');text(title,x+7,4,8.2,true,'#0879c6');};heading('PAX BOOKING',0);
 const cols=[0,28,106,184],sizes=[28,78,78,78];['Cabin','Config','PAX','INF'].forEach((label,i)=>text(label,cols[i]+3,27,7,false,'#58718a'));
 let y=41;
 for(const cabin of ['F','J','Y']){
  const values=[cabin,f['config'+cabin]||'-',f['booking'+cabin]||'0',f['infant'+cabin]||'-'],lines=values.map((v,i)=>wrap(v,sizes[i]-12,9)),h=Math.max(27,...lines.map(a=>a.length*11+10));
  values.forEach((value,i)=>{if(i)rect(cols[i]+2,y,sizes[i]-5,h-3);lines[i].forEach((line,j)=>text(line,cols[i]+7,y+7+j*11,9,i===0));});y+=h;
 }
 text('TTL PAX',3,y+7,8);text(total.pax+' + '+total.infants,190,y+7,9,true);y+=26;text('PLF',3,y+7,8);text(total.plf,212,y+7,9,true);let height=y+30;
 if(specials.length){const start=panel+gap;heading('SPECIAL INFORMATION',start);let top=27;
  for(let offset=0;offset<specials.length;offset+=2){const row=specials.slice(offset,offset+2),values=row.map(([,v])=>wrap(v,53,8.7)),labels=row.map(([label])=>wrap(label,58,7.2)),h=Math.max(29,...row.map((_,i)=>Math.max(values[i].length*11,labels[i].length*10)+12));
   row.forEach(([label,value],i)=>{const x=start+i*134;rect(x+65,top,63,h-4);labels[i].forEach((line,j)=>text(line,x+3,top+8+j*10,7.2,false,'#58718a'));values[i].forEach((line,j)=>text(line,x+70,top+7+j*11,8.7,true));});top+=h;
  }height=Math.max(height,top+9);
 }
 return {width,height,commands};
}
function summarySvg(snapshot){const plan=summaryLayout(snapshot);return `<svg xmlns="http://www.w3.org/2000/svg" class="departure-summary" role="img" aria-label="PAX Booking and populated Special Information" viewBox="0 0 ${plan.width} ${plan.height}">${plan.commands.map(c=>c.kind==='rect'?`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${c.fill}" stroke="${c.stroke}" stroke-width=".5"/>`:`<text x="${c.x}" y="${c.y+c.size}" font-family="Arial, sans-serif" font-size="${c.size}" font-weight="${c.bold?700:400}" fill="${c.color}">${escape(c.value)}</text>`).join('')}</svg>`;}
module.exports={summaryLayout,summarySvg};
