const fs=require('node:fs/promises'),crypto=require('node:crypto');
async function fingerprint(settings,query='SY',cache=new Map(),walk=require('./log-store').walk){
 const roots=[...new Set([settings.logFolder,query.includes('/')?settings.historyFolder:null].filter(Boolean))],rows=[],active=new Set();
 for(const root of roots){
  try{for(const file of await walk(root)){
   active.add(file);
   try{
    const stat=await fs.stat(file),signature=stat.size+':'+stat.mtimeMs;
    let entry=cache.get(file);
    if(!entry||entry.signature!==signature){entry={signature,hash:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')};cache.set(file,entry);}
    rows.push([file,entry.hash]);
   }catch(error){rows.push([file,error.code]);}
  }}catch(error){rows.push([root,error.code]);}
 }
 for(const file of cache.keys())if(!active.has(file))cache.delete(file);
 return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
function localLive(req,res,settings,query,interval=1000){
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': local log stream\n\n');
 let previous,working=false,closed=false,ticks=0;const cache=new Map();
 const check=async()=>{
  if(working||closed)return;working=true;
  try{
   const current=await fingerprint(settings,query,cache);if(closed)return;
   if(previous===undefined)res.write('event: ready\ndata: {}\n\n');
   else if(current!==previous)res.write('event: refresh\ndata: '+JSON.stringify({query,source:'local'})+'\n\n');
   else if(++ticks%15===0)res.write(': heartbeat\n\n');
   previous=current;
  }catch{if(!closed)res.write(': retry\n\n');}finally{working=false;}
 };
 check();const timer=setInterval(check,interval);timer.unref();res.on('close',()=>{closed=true;clearInterval(timer);});
}
module.exports={fingerprint,localLive};
