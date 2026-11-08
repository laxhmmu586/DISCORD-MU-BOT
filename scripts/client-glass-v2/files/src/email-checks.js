'use strict';
const crypto=require('node:crypto');
function queryFor(sy){return {flightNo:sy.flightNo,flightDate:sy.flightDate,aircraftRegistration:sy.aircraftRegistration||'',gdQuery:{crew:(sy.crewApis?.gdCheckQuery?.crew||[]).map((row,index)=>({no:index+1,passport:row.passport||''}))}}}
function createEmailChecks({fetch=global.fetch,now=Date.now}={}){
 const cache=new Map();
 return function emailChecks(sy,authorization){
  const query=queryFor(sy),key=crypto.createHash('sha256').update(JSON.stringify([authorization,query])).digest('hex');
  let entry=cache.get(key);
  if(authorization&&(!entry||(!entry.pending&&now()-entry.at>=30000))){
   entry={pending:true,at:now()};cache.set(key,entry);if(cache.size>100)for(const [id,item]of cache)if(!item.pending)cache.delete(id);
   const current=entry;
   current.promise=Promise.resolve().then(async()=>{
    const response=await fetch('https://api.mufcapp.net/flight-email-checks',{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(query),signal:AbortSignal.timeout(60000)});
    const result=await response.json();if(!response.ok||result.error)throw Error(result.error||'Gmail check HTTP '+response.status);
    if(result.flightNo!==sy.flightNo||result.flightDate!==sy.flightDate)throw Error('Gmail result does not match the selected local flight/date.');
    current.data=result;
   }).catch(error=>{current.error=error.message}).finally(()=>{current.pending=false;current.at=now()});
  }
  const gd=sy.crewApis?.steps?.find(step=>step.key==='gdCheck');
  const state=!authorization?'offline':entry?.pending?'pending':entry?.error?'error':entry?.data?'ready':'pending';
  const message=state==='ready'?'Gmail data checked against local flight logs.':state==='error'?entry.error:state==='offline'?'Sign in to read Gmail data.':'Loading Gmail data for the selected local flight.';
  sy.desktopCloud={state,message};sy.spml||={};
  sy.spml.email={found:false,source:'gmail',reason:message,...(state==='error'?{error:message}:{})};
  if(gd)Object.assign(gd,{complete:false,searched:state==='error',source:'gmail-local-log',time:'',details:{},detailText:'',reason:message,tooltip:message});
  if(state==='ready'){
   const result=entry.data.gdCheck||{};
   if(gd)Object.assign(gd,{complete:Boolean(result.complete),searched:true,time:result.sentAt?.slice(11,19)||'',details:result,detailText:result.detailText||'',reason:result.reason||'',tooltip:result.complete?'GD matches the local flight, date, aircraft and crew.':result.reason||'GD is not complete.'});
   sy.spml.email={...entry.data.mealEmail,source:'gmail'};
  }
  return sy;
 };
}
module.exports={queryFor,createEmailChecks};
