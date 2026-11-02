'use strict';
const crypto=require('node:crypto');
const AIRLINE='CHINA EASTERN AIRLINES',RECIPIENT='lax-watch-cmdr@cbp.dhs.gov';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function eta(value){
 const match=/^(\d{1,2}):?(\d{2})\s*(AM|PM)?L?$/i.exec(String(value||'').trim());if(!match)return null;
 let hour=Number(match[1]),minute=Number(match[2]);if(minute>59||hour>(match[3]?12:23)||match[3]&&hour<1)return null;
 if(match[3])hour=hour%12+(match[3].toUpperCase()==='PM'?12:0);
 return {clock:String(hour).padStart(2,'0')+String(minute).padStart(2,'0'),form:String(hour%12||12).padStart(2,'0')+String(minute).padStart(2,'0')+(hour<12?'AM':'PM')};
}
function passengers(rows,flight){
 if(!Array.isArray(rows)||rows.length>500)fail('Enter up to 500 passengers.');
 const ids=new Set(),text=(value,label,max)=>{if(typeof value!=='string')fail('Enter '+label+'.');const result=value.replace(/\s+/g,' ').trim();if(!result||result.length>max||/[\x00-\x1f\x7f]/.test(result))fail('Enter a valid '+label+'.');return result;};
 return rows.map(row=>{const id=row?.id||crypto.randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(id))fail('Passenger identifiers are invalid. Reload the list.');ids.add(id);const flightNo=text(row.flight||flight,'flight number',12).replace(/\s/g,'').toUpperCase();if(!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(flightNo))fail('Enter a flight number such as MU583 or UA123.');return {id,name:text(row.name,'passenger name',120),seat:text(row.seat,'seat number',12).toUpperCase(),flight:flightNo,destination:text(row.destination,'destination',120)};});
}
function mail({flight,flightDate,count,eta:time},now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'short',day:'2-digit'}).formatToParts(now),part=type=>parts.find(p=>p.type===type).value,day=part('day'),month=part('month').toUpperCase(),year=part('year');
 const subject=`EXPRESS PASS APPLY FOR ${flight}/${day}${month}${year.slice(-2)}`;
 const text=`Dear Officer:\n\nChina Eastern Airlines ${flight}\n\nDate: ${day}.${month}.${year}\n\nFlight Estimated Arrival Time:${time.clock} .\n\nTotal Number of Express Connection PAX: ${count}`;
 const sendDate=`${day}${month}${year}`,contentKey=crypto.createHash('sha256').update(JSON.stringify({flight,flightDate,count,eta:time.clock,sendDate,recipient:RECIPIENT})).digest('hex');
 return {recipient:RECIPIENT,subject,text,sendDate,contentKey,filename:`EXPRESS CONNECT ${flight} ${day}${month}${year.slice(-2)}.pdf`};
}
module.exports={AIRLINE,RECIPIENT,eta,passengers,mail,fail};
