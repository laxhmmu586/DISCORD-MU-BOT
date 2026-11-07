'use strict';
// Only SY/BND terminal sections leave this process. No PNR/PD/FB/PR export.
function createPublisher({store,context,getAuthorization,fetch=global.fetch,now=Date.now}) {
  let running=false,last='',lastAt=0,snapshot=null,status={pending:true,message:'Waiting for employee sign-in.'};
  async function tick() {
    const authorization=getAuthorization();if(!authorization||running)return;
    running=true;
    try {
      const date=context.operationalDate(new Date(now()));
      const selected=new Map();
      for(const section of context.sections(await store.read())) {
        const kind=section.text.match(/(?:^|\n)\s*(?:>\s*)?(SY|BND):/i)?.[1]?.toUpperCase();
        if(!kind||section.flightDate!==date||!context.SUPPORTED_FLIGHTS.includes(section.flightNo))continue;
        if(/(?:^|\n)\s*(?:>\s*)?(?:PR|PD|PNR|RT|ET):/i.test(section.text))continue;
        if(kind==='SY'&&!context.discoverFlights(section.stamp+'\n'+section.text,{date}).length)continue;
        const key=section.flightNo+kind,prior=selected.get(key);
        if(!prior||section.ts>prior.ts)selected.set(key,section);
      }
      const log=[...selected.values()].map(s=>s.stamp+'\n'+s.text).join('\n');
      if(!log)return;
      if(last===log&&now()-lastAt<60000)return;
      const response=await fetch('https://api.mufcapp.net/flight-day-sync',{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({log}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('Flight database sync HTTP '+response.status);
      snapshot=await response.json();last=log;lastAt=now();status={pending:false,message:'Flight data synchronized to boarding SQLite.'};
    } catch(error){status={pending:true,message:error.message};}
    finally{running=false;}
  }
  return {tick,status:()=>({configured:true,...status}),snapshot:()=>snapshot};
}
module.exports={createPublisher};
