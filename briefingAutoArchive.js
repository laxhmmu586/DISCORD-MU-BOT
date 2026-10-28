const crypto=require('node:crypto');
const TIMES=['blockTime','firstPax','lastPax','firstBag','lastBag'];
const CHANNEL='1563411695936864447',FOLDER='1NX1WCsYZqNvdz57J8oGb7h1yQWyt_O1S';
function createAutoArchive({db,briefing,client,reserveDriveId,uploadDrive,now=()=>new Date(),logger=console}){
 db.exec('CREATE TABLE IF NOT EXISTS briefing_auto_clock(date TEXT,flight TEXT,signature TEXT,since INTEGER,PRIMARY KEY(date,flight));CREATE TABLE IF NOT EXISTS briefing_auto_jobs(date TEXT,flight TEXT,signature TEXT,report_id TEXT,drive_id TEXT,drive_sent INTEGER DEFAULT 0,discord_state TEXT DEFAULT \'pending\',message_id TEXT,error TEXT,PRIMARY KEY(date,flight,signature))');
 let busy=false,timer;
 const update=(job,sql,...args)=>db.prepare('UPDATE briefing_auto_jobs SET '+sql+' WHERE date=? AND flight=? AND signature=?').run(...args,job.date,job.flight,job.signature);
 async function tick(){if(busy||!client.isReady())return;busy=true;try{
  const date=require('./etabAdvisory').localDate(now()),stamp=now().getTime();
  for(const row of db.prepare("SELECT * FROM briefing_records WHERE date=? OR EXISTS(SELECT 1 FROM briefing_auto_clock c WHERE c.date=briefing_records.date AND c.flight=briefing_records.flight AND c.signature!='' AND c.since>=?)").all(date,stamp-48*3600000)){
   const fields=briefing.record(row).fields,signature=TIMES.every(k=>String(fields[k]||'').trim())?crypto.createHash('sha256').update(JSON.stringify(TIMES.map(k=>fields[k]))).digest('hex'):'';
   const clock=db.prepare('SELECT * FROM briefing_auto_clock WHERE date=? AND flight=?').get(row.date,row.flight);
   if(!clock||clock.signature!==signature){db.prepare('INSERT INTO briefing_auto_clock VALUES(?,?,?,?) ON CONFLICT(date,flight) DO UPDATE SET signature=excluded.signature,since=excluded.since').run(row.date,row.flight,signature,stamp);continue;}
   if(!signature||stamp-clock.since<300000)continue;
   db.prepare('INSERT OR IGNORE INTO briefing_auto_jobs(date,flight,signature) VALUES(?,?,?)').run(row.date,row.flight,signature);
   const job=db.prepare('SELECT * FROM briefing_auto_jobs WHERE date=? AND flight=? AND signature=?').get(row.date,row.flight,signature);
   try{
    if(!job.report_id){const id=crypto.createHash('sha256').update(row.date+'|'+row.flight+'|'+signature).digest('hex').slice(0,32);let report=db.prepare('SELECT id FROM briefing_reports WHERE id=?').get(id);if(!report)report=await briefing.generateReport(row,{employeeId:'system:briefing-auto',name:'Automatic archive'},fields,id);job.report_id=report.id;update(job,'report_id=?',report.id);}
   }catch(error){update(job,'error=?',String(error.message).slice(0,500));logger.error('Briefing auto archive:',error.message);}
  }
  for(const job of db.prepare("SELECT * FROM briefing_auto_jobs WHERE report_id IS NOT NULL AND (drive_sent=0 OR discord_state!='sent')").all()){
   try{
    const report=db.prepare('SELECT * FROM briefing_reports WHERE id=? AND deleted_at IS NULL').get(job.report_id);if(!report){update(job,"drive_sent=1,discord_state='deleted',error=NULL");continue;}
    const name=job.date+' '+job.flight+' ARRIVAL BRIEFING SHEET.pdf';
    let driveError=null;
    try{if(!job.drive_sent){if(!job.drive_id){job.drive_id=await reserveDriveId();update(job,'drive_id=?',job.drive_id);}try{await uploadDrive({id:job.drive_id,name,bytes:report.pdf,folderId:FOLDER,reportId:report.id});}catch(error){if(!/provided file ID is not usable/i.test(String(error.message)))throw error;job.drive_id=await reserveDriveId();update(job,'drive_id=?',job.drive_id);await uploadDrive({id:job.drive_id,name,bytes:report.pdf,folderId:FOLDER,reportId:report.id});}update(job,'drive_sent=1,error=NULL');}}
    catch(error){driveError=String(error.message).slice(0,500);update(job,'error=?',driveError);logger.error('Briefing Drive archive:',driveError);}
    if(job.discord_state!=='sent'){
     const channel=await client.channels.fetch(CHANNEL),marker='Briefing archive: '+report.id;
     if(job.discord_state==='sending'){const messages=await channel.messages.fetch({limit:100});const found=messages.find(m=>m.author?.id===client.user.id&&(m.content?.includes(marker)||m.nonce===report.id.replaceAll('-','').slice(0,25)||m.attachments?.some?.(a=>a.description===marker)));if(found)update(job,"discord_state='sent',message_id=?,error=?",found.id,driveError);else logger.error('Briefing delivery requires reconciliation:',report.id);continue;}
     update(job,"discord_state='sending'");const sent=await channel.send({content:'📄 '+name+'\n✅ document archive',files:[{attachment:report.pdf,name,description:marker}],nonce:report.id.replaceAll('-','').slice(0,25),enforceNonce:true,allowedMentions:{parse:[]}});if(!sent.id||sent.attachments?.size!==1)throw Error('Discord did not acknowledge report attachment');update(job,"discord_state='sent',message_id=?,error=?",sent.id,driveError);
    }
   }catch(error){update(job,'error=?',String(error.message).slice(0,500));logger.error('Briefing auto delivery:',error.message);}
  }
 }catch(error){logger.error('Briefing auto archive:',error.message);}finally{busy=false;}}
 return {tick,start(){if(timer)return;void tick();timer=setInterval(()=>void tick(),15000);timer.unref?.();},close(){clearInterval(timer);timer=null;}};
}
module.exports={createAutoArchive,TIMES,CHANNEL,FOLDER};
