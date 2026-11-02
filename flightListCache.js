'use strict';
const {createHash}=require('node:crypto'),{discoverFlights,operationalDate,SUPPORTED_FLIGHTS}=require('./flightContext');
class FlightListCache{
 constructor({db,loadLog,now=Date.now,report=console.warn}){Object.assign(this,{db,loadLog,now,report});db.exec('CREATE TABLE IF NOT EXISTS flight_list_cache(date TEXT PRIMARY KEY,payload TEXT NOT NULL,revision TEXT NOT NULL,checked_at INTEGER NOT NULL)');}
 date(){return operationalDate(new Date(this.now()));}
 snapshot(){const row=this.db.prepare('SELECT * FROM flight_list_cache WHERE date=?').get(this.date());return row?{date:row.date,flights:JSON.parse(row.payload).map(({flightNo,flightDate})=>({flightNo,flightDate})),revision:row.revision}:null;}
 update(log,date=this.date(),{force=false}={}){
  const resident=this.snapshot();if(resident?.flights.length&&!force)return resident;
  if(!log||date!==this.date())return resident;const hash=createHash('sha256').update(log).digest('hex');
  if(hash===this.sourceHash&&date===this.sourceDate){this.checkedAt=this.now();return this.snapshot();}
  const previous=this.snapshot(),merged=new Map((previous?.flights||[]).map(flight=>[flight.flightNo,flight]));
  for(const flight of discoverFlights(log,{date}))merged.set(flight.flightNo,{flightNo:flight.flightNo,flightDate:flight.flightDate});
  const flights=[...merged.values()].sort((a,b)=>SUPPORTED_FLIGHTS.indexOf(a.flightNo)-SUPPORTED_FLIGHTS.indexOf(b.flightNo)),payload=JSON.stringify(flights),revision=createHash('sha256').update(date+payload).digest('hex');
  this.db.prepare('INSERT INTO flight_list_cache VALUES(?,?,?,?) ON CONFLICT(date) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,checked_at=excluded.checked_at').run(date,payload,revision,this.now());
  this.sourceHash=hash;this.sourceDate=date;this.checkedAt=this.now();return {date,flights,revision};
 }
 refresh({force=false}={}){if(this.pending)return this.pending;const date=this.date();this.pending=Promise.resolve().then(()=>this.loadLog()).then(log=>{if(!log)throw Error('Unable to read flight logs.');return this.update(log,date,{force});}).finally(()=>{this.pending=null;});return this.pending;}
 async read({force=false}={}){const current=this.snapshot();return force||!current?this.refresh({force}):current;}
}
function register(app,cache){
 app.get('/flights',async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await cache.read({force:req.query.refresh==='1'}));}catch{res.status(503).json({error:'Unable to read flight logs.'});}});
}
module.exports={FlightListCache,register};
