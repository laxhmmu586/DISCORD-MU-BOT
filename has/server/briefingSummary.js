const fields=require('../public/briefing-fields');
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// PDF/report share the default plan; camera PNGs use the compact photo plan.
function summaryLayout(snapshot,{photo=false}={}){
 const f=snapshot.fields,total=fields.booking(f),specials=fields.specialInformation(f,'departure'),commands=[],width=548,panel=262,gap=24;
 const rect=(x,y,w,h,fill='#fffdf0',stroke='#d5e3ef')=>commands.push({kind:'rect',x,y,w,h,fill,stroke});
 const text=(value,x,y,size=9,bold=false,color='#14385e')=>commands.push({kind:'text',value:String(value??''),x,y,size,bold,color});
 const wrap=(value,w,size)=>{const result=[];for(const para of String(value||'-').split('\n')){let line='',used=0;for(const ch of para){const n=size*(ch.codePointAt(0)>255?1:.62);if(line&&used+n>w){const split=photo?line.lastIndexOf(' '):-1;if(split>0){result.push(line.slice(0,split));line=line.slice(split+1);used=[...line].reduce((sum,c)=>sum+size*(c.codePointAt(0)>255?1:.62),0);}else{result.push(line);line='';used=0;}}if(line&&used+n>w){result.push(line);line='';used=0;}if(photo&&!line&&ch===' ')continue;line+=ch;used+=n;}result.push(line);}return result;};
 const heading=(title,x,top=0)=>{rect(x,top,panel,18,'#eef5fb','#eef5fb');text(title,x+7,top+4,8.2,true,'#0879c6');};heading('PAX BOOKING',0);
 const cols=[0,28,106,184],sizes=[28,78,78,78];['Cabin','Config','PAX','INF'].forEach((label,i)=>text(label,cols[i]+3,27,7,false,'#58718a'));
 let y=41;
 for(const cabin of ['F','J','Y']){
  const values=[cabin,f['config'+cabin]||'-',f['booking'+cabin]||'0',f['infant'+cabin]||'-'],lines=values.map((v,i)=>wrap(v,sizes[i]-12,9)),h=Math.max(photo?23:27,...lines.map(a=>a.length*11+10));
  values.forEach((value,i)=>{if(i)rect(cols[i]+2,y,sizes[i]-5,h-3);lines[i].forEach((line,j)=>text(line,cols[i]+7,y+7+j*11,9,i===0));});y+=h;
 }
 text('TTL PAX',3,y+7,8);text(total.pax+' + '+total.infants,190,y+7,9,true);y+=photo?20:26;text('PLF',3,y+7,8);text(total.plf,212,y+7,9,true);let height=y+30;
 if(specials.length){const start=photo?0:panel+gap,sectionTop=photo?height+5:0;heading('SPECIAL INFORMATION',start,sectionTop);let top=sectionTop+27;
  for(let offset=0;offset<specials.length;offset+=2){const row=specials.slice(offset,offset+2),values=row.map(([,v])=>wrap(v,53,8.7)),labels=row.map(([label])=>wrap(label,58,7.2)),h=Math.max(photo?25:29,...row.map((_,i)=>Math.max(values[i].length*11,labels[i].length*10)+12));
   row.forEach(([label,value],i)=>{const x=start+i*134;rect(x+65,top,63,h-4);labels[i].forEach((line,j)=>text(line,x+3,top+8+j*10,7.2,false,'#58718a'));values[i].forEach((line,j)=>text(line,x+70,top+7+j*11,8.7,true));});top+=h;
  }height=Math.max(height,top+9);
 }
 if(photo){
  const checkTop=height+4,checks=fields.timeChecks(require('../../etabAdvisory').localDate(new Date(snapshot.generatedAt)));heading('TIME CHECK',0,checkTop);
  const times=[['24 Hr Transit not over',checks.transit],['240 Last Day',checks.visa240],['21 YRS OLD',checks.age21]],cell=(panel-10)/3,labels=times.map(([label])=>wrap(label,cell-10,6.1)),labelHeight=Math.max(...labels.map(lines=>lines.length))*8,cellTop=checkTop+24,cellHeight=labelHeight+22;
  times.forEach(([,value],i)=>{const x=i*(cell+5);rect(x,cellTop,cell,cellHeight);labels[i].forEach((line,j)=>text(line,x+5,cellTop+4+j*8,6.1,false,'#58718a'));text(value,x+5,cellTop+labelHeight+7,8,true);});height=cellTop+cellHeight+5;
  const prices=require('../public/briefing-prices'),cards=prices.cards(snapshot.priceReference),start=panel+gap;heading('PRICE',start);let top=24;
  const paragraph=(value,size=6.7,color='#58718a')=>{for(const line of wrap(value,panel-10,size)){text(line,start+5,top,size,false,color);top+=size+2;}top+=3;};
  paragraph(prices.notice,7.2,'#14385e');
  // Align the shared baggage labels once, with a price column for each route.
  const routes=cards.slice(0,2),routeTitles=routes.map(card=>wrap(card.title==='US–China–International'?'US–China–Intl':card.title,59,6.4)),routeHeight=Math.max(...routeTitles.map(lines=>lines.length))*8+5;
  rect(start,top,panel,routeHeight,'#eef5fb','#eef5fb');text('Baggage / seats',start+5,top+3,7,true);routeTitles.forEach((lines,i)=>lines.forEach((line,j)=>text(line,start+134+i*64,top+2+j*8,6.4,true)));top+=routeHeight+2;
  for(const [a,b] of [[0,0],[1,1],[2,2],[3,null],[4,3],[5,4],[6,null],[7,null]]){
   const first=routes[0].rows[a],second=b===null?null:routes[1].rows[b],label=second&&second[0]!==first[0]?first[0]+' / '+second[0]:first[0],labels=wrap(label,124,6.6),values=[wrap(first[1],58,7),wrap(second?second[1]:'—',58,7)],h=Math.max(labels.length,...values.map(lines=>lines.length))*8.5+3;
   rect(start,top,panel,h);labels.forEach((line,j)=>text(line,start+5,top+2+j*8.5,6.6));values.forEach((lines,i)=>lines.forEach((line,j)=>text(line,start+134+i*64,top+2+j*8.5,7,true)));top+=h+1;
  }top+=4;
  const pair=(items)=>{const width=(panel-6)/2,headingLines=items.map(card=>wrap(card.title,width-10,7.1)),h=Math.max(...headingLines.map(lines=>lines.length))*8.5+5;
   items.forEach((card,i)=>{const x=start+i*(width+6);rect(x,top,width,h,'#eef5fb','#eef5fb');headingLines[i].forEach((line,j)=>text(line,x+5,top+2+j*8.5,7.1,true));});top+=h+2;
   for(let row=0;row<Math.max(...items.map(card=>card.rows.length));row++){const entries=items.map(card=>card.rows[row]?{labels:wrap(card.rows[row][0],72,6.6),values:wrap(card.rows[row][1],43,7)}:null),height=Math.max(...entries.filter(Boolean).map(entry=>Math.max(entry.labels.length,entry.values.length)))*8.5+3;
    entries.forEach((entry,i)=>{if(!entry)return;const x=start+i*(width+6);rect(x,top,width,height);entry.labels.forEach((line,j)=>text(line,x+5,top+2+j*8.5,6.6));entry.values.forEach((line,j)=>text(line,x+80,top+2+j*8.5,7,true));});top+=height+1;
   }top+=4;
  };
  pair(cards.slice(2,4));
  const baggage=cards[4];pair([{title:baggage.title,rows:baggage.rows.filter((_,i)=>i%2===0)},{title:'CNY / USD',rows:baggage.rows.filter((_,i)=>i%2===1)}]);
  for(const card of cards.slice(5)){const titleLines=wrap(card.title,panel-10,7.5),h=titleLines.length*9+5;rect(start,top,panel,h,'#eef5fb','#eef5fb');titleLines.forEach((line,i)=>text(line,start+5,top+2+i*9,7.5,true));top+=h+2;paragraph(card.text,7,'#14385e');top+=3;}
  paragraph(prices.footnote,6.2);height=Math.max(height,top+3);
 }

 return {width,height,commands};
}
function summarySvg(snapshot,options){const plan=summaryLayout(snapshot,options);return `<svg xmlns="http://www.w3.org/2000/svg" class="departure-summary" role="img" aria-label="${options?.photo?'PAX Booking, Special Information and Price':'PAX Booking and populated Special Information'}" viewBox="0 0 ${plan.width} ${plan.height}">${plan.commands.map(c=>c.kind==='rect'?`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${c.fill}" stroke="${c.stroke}" stroke-width=".5"/>`:`<text x="${c.x}" y="${c.y+c.size}" font-family="Arial, sans-serif" font-size="${c.size}" font-weight="${c.bold?700:400}" fill="${c.color}">${escape(c.value)}</text>`).join('')}</svg>`;}
module.exports={summaryLayout,summarySvg};
