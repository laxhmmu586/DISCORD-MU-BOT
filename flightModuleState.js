'use strict';
const KEYS=['crewApis','gdCheck','fsc','nextDayInfo','net','ccl','cc','initialFlight','bdtChg'];
const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function isoDate(value){const date=String(value||'').toUpperCase();if(/^\d{4}-\d{2}-\d{2}$/.test(date))return date;const m=/^(\d{2})([A-Z]{3})(\d{2})$/.exec(date);if(!m||!MONTHS.includes(m[2]))return '';return `20${m[3]}-${String(MONTHS.indexOf(m[2])+1).padStart(2,'0')}-${m[1]}`;}
function shiftedDate(value,days=0){const date=isoDate(value);if(!date)return '';const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
class FlightModuleState{
 constructor(db){this.db=db;db.exec('CREATE TABLE IF NOT EXISTS flight_module_completions(flight TEXT NOT NULL,date TEXT NOT NULL,module TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(flight,date,module))');}
 get(flight,date){date=isoDate(date);if(!date)return {};return Object.fromEntries(this.db.prepare('SELECT module,payload FROM flight_module_completions WHERE flight=? AND date=?').all(String(flight||'').toUpperCase(),date).map(row=>[row.module,JSON.parse(row.payload)]));}
 remember(sy,date){date=isoDate(date);if(!date||!sy?.flightNo)return;const steps=[...(sy.crewApis?.steps||[])];const fsc=sy.fscRateSheetSync;if(fsc&&(fsc.skipped===false||fsc.reason==='already synced'))steps.push({key:'fsc',complete:true,sync:fsc,time:fsc.rate||'DONE'});
  const put=this.db.prepare('INSERT OR IGNORE INTO flight_module_completions VALUES(?,?,?,?)');this.db.transaction(()=>{for(const step of steps)if(KEYS.includes(step.key)&&step.complete)put.run(sy.flightNo.toUpperCase(),date,step.key,JSON.stringify({...step,completedAt:new Date().toISOString()}));})();
 }
 apply(sy,date){const saved=this.get(sy?.flightNo,date);for(const step of sy?.crewApis?.steps||[])if(saved[step.key]?.complete)Object.assign(step,saved[step.key],{cached:true});if(saved.fsc?.complete)sy.fscRateSheetSync={...saved.fsc.sync,cached:true};if(sy?.crewApis)sy.crewApis.complete=['crewApis','ccl','cc'].every(key=>sy.crewApis.steps.some(step=>step.key===key&&step.complete));return saved;}
}
module.exports={FlightModuleState,KEYS,isoDate,shiftedDate};
