'use strict';
const {operationalDate,SUPPORTED_FLIGHTS}=require('./flightContext');
function append(record,{db=require('./db'),now=Date.now}={}) {
  db.exec('CREATE TABLE IF NOT EXISTS record_scans(id INTEGER PRIMARY KEY,flight_date TEXT NOT NULL,flight_no TEXT NOT NULL,bn TEXT NOT NULL,seat TEXT NOT NULL,raw TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(flight_date,flight_no,bn))');
  const bn=String(Number(record.bn||0)).padStart(3,'0'),flight=String(record.flight||'').toUpperCase(),seat=String(record.seat||'').trim(),raw=String(record.rawScan||record.raw||'');
  if(!/^\d{3,4}$/.test(bn)||Number(bn)<1||!SUPPORTED_FLIGHTS.includes(flight)||!seat||!raw||raw.length>8192)throw Error('Invalid record scan.');
  try {const result=db.prepare('INSERT INTO record_scans(flight_date,flight_no,bn,seat,raw,created_at) VALUES(?,?,?,?,?,?)').run(operationalDate(new Date(now())),flight,bn,seat,raw,now());return {bn,seat,flight,rowNumber:Number(result.lastInsertRowid),storage:'sqlite'};}
  catch(error){if(error.code==='SQLITE_CONSTRAINT_UNIQUE')throw Object.assign(Error('Duplicate BN '+bn),{code:'DUPLICATE_BN'});throw error;}
}
module.exports={append};
