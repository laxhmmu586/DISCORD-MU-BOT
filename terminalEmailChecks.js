'use strict';
const crypto = require('node:crypto');
const { SUPPORTED_FLIGHTS } = require('./flightContext');
function normalize(input) {
  const flightNo=String(input?.flightNo||'').toUpperCase(),flightDate=String(input?.flightDate||'').toUpperCase();
  if(!SUPPORTED_FLIGHTS.includes(flightNo)||!/^\d{2}(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}$/.test(flightDate))throw Error('Invalid selected flight/date.');
  const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const date=new Date(Date.UTC(2000+Number(flightDate.slice(-2)),months.indexOf(flightDate.slice(2,5)),Number(flightDate.slice(0,2))));
  if(String(date.getUTCDate()).padStart(2,'0')+months[date.getUTCMonth()]+String(date.getUTCFullYear()).slice(-2)!==flightDate)throw Error('Invalid flight date.');
  const registration=String(input.aircraftRegistration||'').toUpperCase().replace(/[\s-]/g,'');
  if(registration&&!/^B[A-Z0-9]{4,5}$/.test(registration))throw Error('Invalid aircraft registration.');
  const rows=input.gdQuery?.crew||[];
  if(!Array.isArray(rows)||rows.length>80)throw Error('Invalid local crew list.');
  const crew=rows.map((row,index)=>{
    const passport=String(row?.passport||'').trim().toUpperCase();
    if(passport&&!/^[A-Z0-9]{4,15}$/.test(passport))throw Error('Invalid crew document.');
    return {no:index+1,passport};
  });
  return {flightNo,flightDate,aircraftRegistration:registration,crew};
}
function createHandler({getGdCheckEmail,getLatestMealOrderEmail,now=Date.now,ttl=30000}={}) {
  const cache=new Map();
  return async(req,res)=>{
    if(!req.desktopUser?.uid)return res.status(403).json({error:'Approved desktop sign-in required.'});
    let query;try{query=normalize(req.body)}catch(error){return res.status(400).json({error:error.message})}
    const key=crypto.createHash('sha256').update(JSON.stringify([req.desktopUser.uid,query])).digest('hex');
    let entry=cache.get(key);
    if(!entry||(!entry.pending&&now()-entry.at>=ttl)){
      if(cache.size>200)for(const [id,item] of cache)if(!item.pending)cache.delete(id);
      entry={pending:true,at:now()};cache.set(key,entry);
      const {flightNo,flightDate,aircraftRegistration,crew}=query;
      // Gmail search, sender selection, MIME parsing and GD comparison remain
      // owned by the existing mail routines. Only their expected log values change.
      entry.promise=Promise.all([
        getGdCheckEmail(flightNo,flightDate,crew,`GD for ${flightNo}/${flightDate}`,{flightNo,flightDate,aircraftRegistration}),
        getLatestMealOrderEmail(flightNo,flightDate)
      ]).then(([gdCheck,mealEmail])=>({flightNo,flightDate,gdCheck,mealEmail})).finally(()=>{entry.pending=false;entry.at=now()});
    }
    res.set?.('Cache-Control','no-store');
    try{return res.json(await entry.promise)}catch(error){cache.delete(key);return res.status(503).json({error:'Gmail checks are temporarily unavailable. Retry from the client.'})}
  };
}
function mount(app,dependencies){app.post('/flight-email-checks',createHandler(dependencies));}
module.exports={normalize,createHandler,mount};
