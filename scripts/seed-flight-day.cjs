'use strict';
// One-time rollout seed, not a reader fallback or scheduled Drive dependency.
require('dotenv').config({quiet:true});
(async()=>{
 const db=require('../db');
 try {
  const boarding=new(require('../boardingSqliteLive').BoardingSqliteLive)({db});
  const store=new(require('../flightDayStore').FlightDayStore)({db,beforeAccess:()=>boarding.cleanupIfDue()});
  const log=await require('../googleDrive').getLatestFlightLog();if(!log)throw Error('No source logs available; do not switch production readers yet.');
  const {sections,operationalDate}=require('../flightContext');const date=operationalDate();
  const latest=new Map();for(const section of sections(log)){const kind=section.text.match(/(?:^|\n)\s*(?:>\s*)?(SY|BND):/i)?.[1];if(section.flightDate!==date||!kind)continue;const key=section.flightNo+kind;if(!latest.has(key)||section.ts>latest.get(key).ts)latest.set(key,section);}
  const compact=[...latest.values()].map(s=>s.stamp+'\n'+s.text).join('\n');
  const result=store.ingest(compact);if(!result.flights.length)throw Error('No current LAX SY available; do not switch production readers yet.');
  console.log(JSON.stringify({date:result.date,flights:result.flights.map(f=>f.flightNo),accepted:result.accepted,storage:result.storage}));
 } finally {db.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
