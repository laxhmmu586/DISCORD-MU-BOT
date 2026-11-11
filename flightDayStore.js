'use strict';
const {sections,discoverFlights,operationalDate,SUPPORTED_FLIGHTS} = require('./flightContext');
const {createHash} = require('node:crypto');
class FlightDayStore {
  constructor({db,beforeAccess=()=>{},now=Date.now}) {
    Object.assign(this,{db,beforeAccess,now});
    db.exec(`CREATE TABLE IF NOT EXISTS flight_day_sections (
      flight_date TEXT NOT NULL,flight_no TEXT NOT NULL,kind TEXT NOT NULL,
      stamp INTEGER NOT NULL,raw TEXT NOT NULL,hash TEXT NOT NULL,
      PRIMARY KEY(flight_date,flight_no,kind));`);
    this.rows=db.prepare('SELECT * FROM flight_day_sections WHERE flight_date=? ORDER BY stamp,flight_no,kind');
    this.put=db.prepare(`INSERT INTO flight_day_sections VALUES(?,?,?,?,?,?)
      ON CONFLICT(flight_date,flight_no,kind) DO UPDATE SET stamp=excluded.stamp,raw=excluded.raw,hash=excluded.hash
      WHERE excluded.stamp > flight_day_sections.stamp`);
    this.write=db.transaction(rows=>{for(const row of rows)this.put.run(...row);});
  }
  ingest(log) {
    this.beforeAccess();const date=operationalDate(new Date(this.now()));
    if(typeof log!=='string'||Buffer.byteLength(log)>1024*1024)throw Error('Invalid flight-day log');
    const rows=[];
    for(const section of sections(log)) {
      const kind=section.text.match(/(?:^|\n)\s*(?:>\s*)?(SY|BND):/i)?.[1]?.toUpperCase();
      if(!kind||section.flightDate!==date||!SUPPORTED_FLIGHTS.includes(section.flightNo)||!section.ts)continue;
      if(/(?:^|\n)\s*(?:>\s*)?(?:PR|PD|PNR|RT|ET):/i.test(section.text))continue;
      // A future terminal clock must not permanently suppress subsequent updates.
      if(section.ts>this.now()+14*3600000)continue;
      if(kind==='SY'&&!discoverFlights((section.stamp+'\n'+section.text),{date}).length)continue;
      if(kind==='BND'&&!/BOARDING NUMBER RANGE:\s*\d+\s*--\s*\d+/i.test(section.text))continue;
      const raw=section.stamp+'\n'+section.text;
      rows.push([date,section.flightNo,kind,section.ts,raw,createHash('sha256').update(raw).digest('hex')]);
    }
    this.write(rows);return {ok:true,date,accepted:rows.length,...this.snapshot()};
  }
  log() { this.beforeAccess();return this.rows.all(operationalDate(new Date(this.now()))).map(row=>row.raw).join('\n'); }
  snapshot() {
    const date=operationalDate(new Date(this.now())),log=this.log();
    return {date,flights:discoverFlights(log,{date}),revision:createHash('sha256').update(date+log).digest('hex'),storage:'sqlite'};
  }
  get(flight,date=operationalDate(new Date(this.now()))) {if(date!==operationalDate(new Date(this.now())))return null;return this.snapshot().flights.find(row=>row.flightNo===flight)||null;}
  bagInfo(flight='MU586',date=operationalDate(new Date(this.now()))) {
    if(date!==operationalDate(new Date(this.now())))return null;
    const log=require('./flightContext').scopedLog(this.log(),flight,date),parser=require('./syParser');
    return require('./scripts/desktop-updates/terminal-bags.cjs').bagInfo(parser.findSYInfo(log,date,{preferredFlightNo:flight,strictPreferredFlight:true}),parser.findBoardingBoxInfo(log,flight,date));
  }
}
function register(app,{store,onUpdate=()=>{},syncReports}) {
  app.post('/flight-day-sync',async (req,res)=>{
    if(!req.desktopUser)return res.status(403).json({error:'Approved employee desktop required.'});
    try {
      const result=store.ingest(req.body?.log);
      onUpdate(store.log());
      if (req.body.reports !== undefined && syncReports) {
        try {
          await syncReports(req.body.reports, result.date);
          result.reports = {ok:true};
        } catch (error) {
          console.warn('Desktop report sync:', error.message);
          result.reports = {ok:false,error:'Unable to save local report rows.'};
        }
      }
      res.set('Cache-Control','no-store');
      res.json(result);
    }
    catch(error){res.status(400).json({error:error.message});}
  });
}
let current;
module.exports={FlightDayStore,register,setCurrent:store=>{current=store;},current:()=>current||(current=new FlightDayStore({db:require('./db')}))};
