const crypto=require('node:crypto');
const ARRIVAL_TIMES=['blockTime','firstPax','lastPax','firstBag','lastBag'];
function createFinishStore(db,{now=()=>new Date()}={}){
 db.exec("CREATE TABLE IF NOT EXISTS briefing_finish(id TEXT PRIMARY KEY,date TEXT NOT NULL,flight TEXT NOT NULL,direction TEXT NOT NULL,created_at INTEGER NOT NULL,due_at INTEGER NOT NULL,state TEXT NOT NULL,report_id TEXT,image BLOB,drive_id TEXT,drive_sent INTEGER NOT NULL DEFAULT 0,discord_state TEXT NOT NULL DEFAULT 'pending',message_id TEXT,error TEXT,UNIQUE(date,flight))");
 if(!db.prepare('PRAGMA table_info(briefing_finish)').all().some(column=>column.name==='revision'))db.exec('ALTER TABLE briefing_finish ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
 const get=key=>db.prepare('SELECT * FROM briefing_finish WHERE date=? AND flight=?').get(key.date,key.flight);
 const view=key=>{const row=get(key);return row?{revision:row.revision,id:row.id,state:row.state,dueAt:row.due_at,serverTime:now().getTime(),reportId:row.report_id,driveSent:Boolean(row.drive_sent),discordState:row.discord_state,error:row.error}:{revision:0,state:'idle',serverTime:now().getTime()};};
 const schedule=db.transaction((key,fields)=>{
  const previous=get(key);if(previous&&['pending','processing','completed'].includes(previous.state))return view(key);
  if(key.direction==='arrival'&&!ARRIVAL_TIMES.every(field=>String(fields[field]||'').trim()))throw Object.assign(Error('Fill all five Time Record fields before Finish.'),{status:400});
  const created=now().getTime();db.prepare("INSERT INTO briefing_finish(id,date,flight,direction,created_at,due_at,state) VALUES(?,?,?,?,?,?,'pending') ON CONFLICT(date,flight) DO UPDATE SET id=excluded.id,direction=excluded.direction,created_at=excluded.created_at,due_at=excluded.due_at,state='pending',report_id=NULL,image=NULL,drive_id=NULL,drive_sent=0,discord_state='pending',message_id=NULL,error=NULL,revision=briefing_finish.revision+1").run(crypto.randomUUID(),key.date,key.flight,key.direction,created,created+60000);return view(key);
 });
 const cancel=db.transaction(key=>{const row=get(key);if(!row||row.state==='cancelled')return view(key);if(row.state!=='pending'||now().getTime()>=row.due_at)throw Object.assign(Error('The countdown has ended; this completion can no longer be cancelled.'),{status:409});db.prepare("UPDATE briefing_finish SET state='cancelled',revision=revision+1 WHERE id=? AND state='pending'").run(row.id);return view(key);});
 return {get,view,schedule,cancel};
}
module.exports={createFinishStore,ARRIVAL_TIMES};
