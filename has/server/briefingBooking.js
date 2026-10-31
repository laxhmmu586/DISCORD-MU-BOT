const {sections}=require('../../flightContext');
const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function createBriefingBooking({getLog=()=>require('../../googleDrive').getLatestFlightLog(),now=Date.now,ttl=30000}={}){
 let cache,expires=0,pending;
 async function readSections(){
  if(cache&&now()<expires)return cache;
  if(!pending)pending=Promise.resolve().then(getLog).then(log=>{if(typeof log!=='string'||!log.trim())throw Error('No SY log');cache=sections(log);expires=now()+ttl;return cache;}).catch(error=>{cache=[];expires=now()+ttl;throw error;}).finally(()=>{pending=null;});
  return pending;
 }
 async function read(date,flight){
  const unavailable={status:'unavailable',date,flight,fields:{}};
  const token=date.slice(8,10)+MONTHS[Number(date.slice(5,7))-1]+date.slice(2,4);
  try{
   const match=(await readSections()).filter(section=>{
    const header=section.text.match(/(?:^|\n)\s*(?:>\s*)?SY:\s*(MU\d{3,4})\/(\d{2}[A-Z]{3}\d{2})\s+LAX\//i);
    return header&&header[1].toUpperCase()===flight&&header[2].toUpperCase()===token;
   }).at(-1);
   const counts=match?.text.match(/\*LAX[A-Z]{3}\s+R(\d{3})\/(\d{3})\/(\d{3})\b/i);
   if(!counts)return unavailable;
   return {status:'available',date,flight,fields:Object.fromEntries(['F','J','Y'].map((c,i)=>['booking'+c,String(Number(counts[i+1]))]))};
  }catch{return unavailable;}
 }
 return {read};
}
module.exports={createBriefingBooking};
