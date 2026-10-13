const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function parseEtab(text,flightNo,date){
 const body=String(text||'').split(/Regards|\nOn .+wrote:|\n-{2,}\s*Forwarded/i)[0].replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').toUpperCase();
 const segments=[...body.matchAll(/\b([A-Z]{2}\d{1,4})\s*[\/-]\s*(\d{2})([A-Z]{3})(\d{2,4})?\b/g)];
 for(let i=0;i<segments.length;i++){
  const f=segments[i],expected=date.slice(8,10)+MONTHS[Number(date.slice(5,7))-1];
  if(f[1]!==flightNo||f[2]+f[3]!==expected||(f[4]&&f[4]!==date.slice(f[4].length===2?2:0,4)))continue;
  const content=body.slice(f.index,segments[i+1]?.index||body.length);
  const gate=content.match(/\bGATE\s*[:\-]?\s*(TBA|\d{1,3}[A-Z]?|[A-Z]\d{1,3})\b/)?.[1]||'';
  if(!gate||gate==='TBA')continue;return {flightNo,date,gate};
 }return null;
}
function mailBody(payload){
 const plain=[],html=[];function walk(p){if(!p)return;if(p.body?.data){const text=Buffer.from(p.body.data,'base64url').toString('utf8');if(p.mimeType==='text/plain')plain.push(text);else if(p.mimeType==='text/html')html.push(text);}for(const child of p.parts||[])walk(child);}walk(payload);return plain.length?plain.join('\n'):html.join('\n');
}
function createGateService({getClient=()=>require('./googleDrive').getNextDayInfoGmailClient(),now=Date.now}={}){
 const cache=new Map(),pending=new Map();
 async function read(flightNo,date){
  const key=flightNo+'|'+date,cached=cache.get(key);if(cached&&now()-cached.at<60000)return cached.value;if(pending.has(key))return pending.get(key);
  const task=(async()=>{let value;try{
   const {gmail,userId}=getClient();const start=new Date(date+'T12:00:00Z'),end=new Date(start);start.setUTCDate(start.getUTCDate()-3);end.setUTCDate(end.getUTCDate()+2);
   const q=`from:(LAXHMXH@hallmark-aviation.com OR laxhm21@gmail.com) subject:ETAB after:${start.toISOString().slice(0,10).replaceAll('-','/')} before:${end.toISOString().slice(0,10).replaceAll('-','/')} ${flightNo}`;
   const list=await gmail.users.messages.list({userId,q,maxResults:50},{timeout:15000});const results=[];
   // Bound concurrency and never expose mailbox bodies to the browser.
   for(let i=0;i<(list.data.messages||[]).length;i+=5){const batch=await Promise.all((list.data.messages||[]).slice(i,i+5).map(async m=>{const full=await gmail.users.messages.get({userId,id:m.id,format:'full'},{timeout:15000});const parsed=parseEtab(mailBody(full.data.payload),flightNo,date);const received=Number(full.data.internalDate);return parsed&&Number.isFinite(received)&&received>=start.getTime()-43200000&&received<end.getTime()+43200000?{...parsed,messageId:m.id,receivedAt:new Date(received).toISOString(),status:'available'}:null;}));results.push(...batch.filter(Boolean));}
   results.sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));value=results[0]||{status:'unavailable',flightNo,date,message:'No matching ETAB email for this flight and date'};
  }catch(e){value={status:'error',flightNo,date,message:'Unable to read ETAB email. Check Gmail connection.',...(cached?.value?.status==='available'?{lastKnown:cached.value}:{})};}
  value.checkedAt=new Date(now()).toISOString();cache.set(key,{at:now(),value});if(cache.size>200)cache.delete(cache.keys().next().value);return value;
  })().finally(()=>pending.delete(key));pending.set(key,task);return task;
 }return {read};
}
module.exports={parseEtab,mailBody,createGateService};
