function createBriefingEtab({db,now=()=>new Date()}={}){
 if(!db)throw Error('Briefing ETAB storage requires a database.');
 db.exec('CREATE TABLE IF NOT EXISTS briefing_etab_snapshots(date TEXT NOT NULL,flight TEXT NOT NULL,received_at INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(date,flight))');
 function accept(advisory,metadata={}){
  const date=advisory?.date,arrival=advisory?.arrival,received=Number(metadata.received||Date.parse(metadata.receivedAt||''))||now().getTime();
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date||'')||!/^MU\d{3,4}$/.test(arrival?.flight||'')||!metadata.discordMessageId)throw Error('A delivered ETAB advisory is required.');
  const value={status:'available',date,flight:arrival.flight,registration:arrival.reg||'',eta:(arrival.eta||'').replace(/^(\d{2})(\d{2})L$/,'$1:$2'),gate:arrival.gate||'',pax:arrival.pax||'',crew:arrival.crew||'',receivedAt:new Date(received).toISOString(),discordMessageId:String(metadata.discordMessageId)};
  db.prepare('INSERT INTO briefing_etab_snapshots VALUES(?,?,?,?) ON CONFLICT(date,flight) DO UPDATE SET received_at=excluded.received_at,data=excluded.data WHERE excluded.received_at>=briefing_etab_snapshots.received_at').run(date,arrival.flight,received,JSON.stringify(value));return value;
 }
 function read(date,flight){const row=db.prepare('SELECT data FROM briefing_etab_snapshots WHERE date=? AND flight=?').get(date,flight);return row?JSON.parse(row.data):{status:'unavailable',date,flight,message:'Waiting for ETAB to be posted to Discord for this flight and date.'};}
 return {read,accept};
}
module.exports={createBriefingEtab};
