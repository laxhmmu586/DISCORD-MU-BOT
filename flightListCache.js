'use strict';
const {createHash}=require('node:crypto'),{discoverFlights,operationalDate,SUPPORTED_FLIGHTS}=require('./flightContext');
class FlightListCache{
 constructor({db,loadLog,now=Date.now,report=console.warn}){Object.assign(this,{db,loadLog,now,report});this.listeners=new Set();db.exec('CREATE TABLE IF NOT EXISTS flight_list_cache(date TEXT PRIMARY KEY,payload TEXT NOT NULL,revision TEXT NOT NULL,checked_at INTEGER NOT NULL)');}
 date(){return operationalDate(new Date(this.now()));}
 snapshot(){const row=this.db.prepare('SELECT * FROM flight_list_cache WHERE date=?').get(this.date());return row?{date:row.date,flights:JSON.parse(row.payload),revision:row.revision}:null;}
 update(log,date=this.date()){
  if(!log||date!==this.date())return this.snapshot();const hash=createHash('sha256').update(log).digest('hex');
  if(hash===this.sourceHash&&date===this.sourceDate){this.checkedAt=this.now();return this.snapshot();}
  const previous=this.snapshot(),merged=new Map((previous?.flights||[]).map(flight=>[flight.flightNo,flight]));
  for(const flight of discoverFlights(log,{date}))merged.set(flight.flightNo,flight);
  const flights=[...merged.values()].sort((a,b)=>SUPPORTED_FLIGHTS.indexOf(a.flightNo)-SUPPORTED_FLIGHTS.indexOf(b.flightNo)),payload=JSON.stringify(flights),revision=createHash('sha256').update(date+payload).digest('hex');
  this.db.prepare('INSERT INTO flight_list_cache VALUES(?,?,?,?) ON CONFLICT(date) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,checked_at=excluded.checked_at').run(date,payload,revision,this.now());
  this.sourceHash=hash;this.sourceDate=date;this.checkedAt=this.now();const result={date,flights,revision};if(previous?.revision!==revision)for(const listener of this.listeners){try{listener({date,revision});}catch(error){this.report('Flight update listener:',error.message);}}return result;
 }
 refresh(){if(this.pending)return this.pending;const date=this.date();this.pending=Promise.resolve().then(()=>this.loadLog()).then(log=>{if(!log)throw Error('Unable to read flight logs.');return this.update(log,date);}).finally(()=>{this.pending=null;});return this.pending;}
 subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
 async read({force=false}={}){const current=this.snapshot();return force||!current?this.refresh():current;}
}
function register(app,cache){
 app.get('/flights/live-stream',async(req,res)=>{
  let unsubscribe,timer,closed=false;res.on('close',()=>{closed=true;unsubscribe?.();clearInterval(timer);});
  try{const snapshot=await cache.read();if(closed)return;res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});res.flushHeaders?.();
   const send=value=>{if(res.writableLength>1024*1024){res.end();return;}res.write(`event: flights\ndata: ${JSON.stringify(value)}\n\n`);};
   unsubscribe=cache.subscribe(send);send({date:snapshot.date,revision:snapshot.revision});timer=setInterval(()=>res.write(': keep-alive\n\n'),25000);timer.unref?.();
  }catch{if(!closed)res.status(503).end();}
 });
 app.get('/flights',async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await cache.read({force:req.query.refresh==='1'}));}catch{res.status(503).json({error:'Unable to read flight logs.'});}});
}
module.exports={FlightListCache,register};
