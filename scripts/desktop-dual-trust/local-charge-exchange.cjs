'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
function createLocalChargeExchange({store,filename='',now=()=>new Date(),localFscRate=require('./fsc').localFscRate}){
 let saved={},writing=Promise.resolve();
 const ready=filename?fs.readFile(filename,'utf8').then(t=>{saved=JSON.parse(t);}).catch(e=>{if(e.code!=='ENOENT')throw e;}):Promise.resolve();
 const date=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now()).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day;};
 const token=d=>d.slice(8,10)+['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(d.slice(5,7))-1]+d.slice(2,4);
 const valid=rate=>/^\d+(?:\.\d{1,12})?$/.test(String(rate))&&Number(rate)>0&&Number(rate)<=100;
 const read=day=>saved[day]?.date===day&&valid(saved[day].rate)?saved[day]:{status:'unavailable',date:day,revision:0,rate:'',source:'Local XS FSC'};
 const persist=()=>{if(!filename)return Promise.resolve();const text=JSON.stringify(saved);writing=writing.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename+'.tmp',text);await fs.rename(filename+'.tmp',filename);});return writing;};
 async function exchange(){await ready;const day=date();if(read(day).status==='available')return read(day);let rate;try{rate=localFscRate(await store.read(),token(day))?.rate;}catch{}if(valid(rate)&&date()===day&&read(day).status!=='available'){saved[day]={status:'available',date:day,revision:1,rate:String(rate),source:'Local XS FSC'};await persist();}return read(date());}
 async function save(body){await ready;const day=date(),current=read(day),rate=String(body.rate??'').trim();if(body.date!==day||body.revision!==current.revision)throw Object.assign(Error('Today’s exchange rate changed. Reopen Charge Form before saving.'),{status:409});if(!valid(rate))throw Object.assign(Error('Enter a positive USD / CNY exchange rate.'),{status:400});saved[day]={status:'available',date:day,revision:current.revision+1,rate,source:'Manual (local)'};await persist();return read(day);}
 return {exchange,save};
}
module.exports={createLocalChargeExchange};
