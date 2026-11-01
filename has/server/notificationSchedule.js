const fail=message=>{throw Object.assign(Error(message),{status:400});};
const datePattern=/^20\d\d-\d\d-\d\d$/;
function validDate(value){if(typeof value!=='string'||!datePattern.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('Choose a valid date.');return value;}
function formatter(zone){try{return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch{fail('Choose a valid time zone.');}}
function parts(at,zone){return Object.fromEntries(formatter(zone).formatToParts(new Date(at)).map(p=>[p.type,p.value]));}
function localDate(at,zone){const p=parts(at,zone);return `${p.year}-${p.month}-${p.day}`;}
function validate(schedule){
 if(!schedule||!['once','daily','weekly','monthly'].includes(schedule.frequency))fail('Choose a reminder frequency.');
 if(typeof schedule.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time))fail('Choose a reminder time.');
 if(typeof schedule.timeZone!=='string'||schedule.timeZone.length>80)fail('Choose a time zone.');formatter(schedule.timeZone);
 const result={frequency:schedule.frequency,time:schedule.time,timeZone:schedule.timeZone};
 if(schedule.frequency==='once')result.date=validDate(schedule.date);
 if(schedule.frequency==='weekly'){if(!Array.isArray(schedule.weekdays)||!schedule.weekdays.length||schedule.weekdays.length>7||schedule.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))fail('Choose at least one weekday.');result.weekdays=[...new Set(schedule.weekdays)].sort();}
 if(schedule.frequency==='monthly'){if(!Number.isInteger(schedule.day)||schedule.day<1||schedule.day>31)fail('Choose a day from 1 to 31.');result.day=schedule.day;}
 return result;
}
// Resolve wall time via candidate offsets. Spring gaps use the first valid minute
// after the requested time; autumn overlaps choose only the first occurrence.
function wallTime(date,time,zone){
 const target=Date.parse(date+'T'+time+':00Z'),offsets=new Set();
 for(const delta of [-86400000,0,86400000]){const stamp=target+delta,p=parts(stamp,zone);offsets.add(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-stamp);}
 for(let minute=0;minute<=180;minute++){
  const desired=target+minute*60000,expected=new Date(desired).toISOString().slice(0,16),valid=[];
  for(const offset of offsets){const stamp=desired-offset,p=parts(stamp,zone);if(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`===expected)valid.push(stamp);}
  if(valid.length)return Math.min(...valid);
 }
 fail('Unable to schedule this local time.');
}
function nextOccurrence(schedule,after){
 const start=schedule.frequency==='once'?schedule.date:localDate(after,schedule.timeZone);
 for(let i=0;i<(schedule.frequency==='once'?1:400);i++){
  const date=new Date(Date.parse(start+'T12:00:00Z')+i*86400000).toISOString().slice(0,10),d=new Date(date+'T12:00:00Z');
  if(schedule.frequency==='weekly'&&!schedule.weekdays.includes(d.getUTCDay()))continue;
  if(schedule.frequency==='monthly'){const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();if(d.getUTCDate()!==Math.min(schedule.day,last))continue;}
  const at=wallTime(date,schedule.time,schedule.timeZone);if(at>+new Date(after))return new Date(at).toISOString();
 }
 return null;
}
module.exports={validate,nextOccurrence,wallTime,localDate};
