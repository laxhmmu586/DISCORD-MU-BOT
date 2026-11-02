'use strict';
const {createHash}=require('node:crypto');
const {discoverFlights,scopedLog,operationalDate}=require('./flightContext');
const {findSYInfo}=require('./syParser');
class DashboardSySnapshot{
 constructor({db,completed=()=>({}),now=Date.now}){Object.assign(this,{db,completed,now});db.exec('CREATE TABLE IF NOT EXISTS dashboard_sy_snapshots(flight TEXT NOT NULL,date TEXT NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(flight,date))');}
 get(flight,date){const row=this.db.prepare('SELECT payload,updated_at FROM dashboard_sy_snapshots WHERE flight=? AND date=?').get(flight,date);return row?{...JSON.parse(row.payload),snapshotAt:row.updated_at}:null;}
 put(sy){if(!sy?.flightNo||!sy?.flightDate)return;const {permissions,...payload}=sy;this.db.prepare('INSERT INTO dashboard_sy_snapshots VALUES(?,?,?,?) ON CONFLICT(flight,date) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(sy.flightNo,sy.flightDate,JSON.stringify(payload),this.now());}
 updateFromLog(log){
  if(!log)return;const date=operationalDate(new Date(this.now())),hash=createHash('sha256').update(date+log).digest('hex');if(this.hash===hash)return;
  for(const flight of discoverFlights(log,{date})){
   const sy=findSYInfo(scopedLog(log,flight.flightNo,date),date,{preferredFlightNo:flight.flightNo,strictPreferredFlight:true,preparationLog:log,completedSteps:this.completed(flight.flightNo,date)});if(!sy)continue;
   const previous=this.get(flight.flightNo,date)||{};
   for(const key of ['bagSheet','fscRateSheetSync','bookingSheetSync','salesDetailsSheetSync','bagRoomUnloadAlert'])if(previous[key])sy[key]=previous[key];
   this.put(sy);
  }
  this.hash=hash;
 }
}
module.exports={DashboardSySnapshot};
