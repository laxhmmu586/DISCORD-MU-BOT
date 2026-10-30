const TIMES=require('./has/server/briefingFinish').ARRIVAL_TIMES;
const CHANNEL='1563411695936864447',GATE_CHANNEL='1252032370920656907',FOLDER='1NX1WCsYZqNvdz57J8oGb7h1yQWyt_O1S';
function createAutoArchive({db,briefing,client,reserveDriveId,uploadDrive,now=()=>new Date(),logger=console,buildImage=require('./has/server/briefingImage').buildBriefingImage}){
 require('./has/server/briefingFinish').createFinishStore(db,{now});
 let busy=false,timer;
 const update=(job,sql,...args)=>db.prepare('UPDATE briefing_finish SET '+sql+',revision=revision+1 WHERE id=?').run(...args,job.id);
 async function tick(){if(busy)return;busy=true;try{
  for(const job of db.prepare("SELECT * FROM briefing_finish WHERE state IN ('pending','processing') AND due_at<=?").all(now().getTime())){
   try{
    update(job,"state='processing'");
    if(!job.report_id){if(job.direction==='arrival'&&!TIMES.every(field=>String(briefing.record(job).fields[field]||'').trim()))throw Error('Fill all five Time Record fields to complete.');const id=job.id.replaceAll('-','');let report=db.prepare('SELECT id FROM briefing_reports WHERE id=?').get(id);if(!report)report=await briefing.generateReport(job,{employeeId:'system:briefing-finish',name:'Briefing Finish'},briefing.record(job).fields,id);job.report_id=report.id;update(job,'report_id=?',report.id);}
    const report=db.prepare('SELECT snapshot FROM briefing_reports WHERE id=? AND deleted_at IS NULL').get(job.report_id);if(!report)throw Error('Completed report is unavailable.');
    const image=await buildImage(JSON.parse(report.snapshot));update(job,"image=?,state='completed',error=NULL",image);
   }catch(error){update(job,'error=?',String(error.message).slice(0,500));logger.error('Briefing Finish:',error.message);}
  }
  for(const job of db.prepare("SELECT * FROM briefing_finish WHERE state='completed' AND (drive_sent=0 OR discord_state NOT IN ('sent','deleted'))").all()){
   try{
    const report=db.prepare('SELECT * FROM briefing_reports WHERE id=? AND deleted_at IS NULL').get(job.report_id);if(!report){update(job,"drive_sent=1,discord_state='deleted',error=NULL");continue;}
    const name=job.date+' '+job.flight+' '+job.direction.toUpperCase()+' BRIEFING SHEET.pdf',imageName=job.date+' '+job.flight+' '+(job.direction==='departure'?'GATE LEAD CONTROL SHEET':'ARRIVAL BRIEFING SHEET')+'.png';
    let driveError=null;
    try{if(!job.drive_sent){if(!job.drive_id){job.drive_id=await reserveDriveId();update(job,'drive_id=?',job.drive_id);}try{await uploadDrive({id:job.drive_id,name,bytes:report.pdf,folderId:FOLDER,reportId:report.id});}catch(error){if(!/provided file ID is not usable/i.test(String(error.message)))throw error;job.drive_id=await reserveDriveId();update(job,'drive_id=?',job.drive_id);await uploadDrive({id:job.drive_id,name,bytes:report.pdf,folderId:FOLDER,reportId:report.id});}update(job,'drive_sent=1,error=NULL');}}
    catch(error){driveError=String(error.message).slice(0,500);update(job,'error=?',driveError);logger.error('Briefing Drive archive:',driveError);}
    if(job.discord_state!=='sent'&&client.isReady()){
     const channel=await client.channels.fetch(job.direction==='departure'?GATE_CHANNEL:CHANNEL),marker='Briefing archive: '+report.id;
     if(job.discord_state==='sending'){const messages=await channel.messages.fetch({limit:100});const found=messages.find(m=>m.author?.id===client.user.id&&(m.content?.includes(marker)||m.nonce===report.id.replaceAll('-','').slice(0,25)||m.attachments?.some?.(a=>a.description===marker)));if(found)update(job,"discord_state='sent',message_id=?,error=?",found.id,driveError);else logger.error('Briefing delivery requires reconciliation:',report.id);continue;}
     update(job,"discord_state='sending'");const sent=await channel.send({content:'📄 '+imageName+'\n✅ document archive',files:[{attachment:job.image,name:imageName,description:marker}],nonce:report.id.replaceAll('-','').slice(0,25),enforceNonce:true,allowedMentions:{parse:[]}});if(!sent.id||sent.attachments?.size!==1)throw Error('Discord did not acknowledge report attachment');update(job,"discord_state='sent',message_id=?,error=?",sent.id,driveError);
    }
   }catch(error){update(job,'error=?',String(error.message).slice(0,500));logger.error('Briefing auto delivery:',error.message);}
  }
 }catch(error){logger.error('Briefing Finish:',error.message);}finally{busy=false;}}
 return {tick,start(){if(timer)return;void tick();timer=setInterval(()=>void tick(),1000);timer.unref?.();},close(){clearInterval(timer);timer=null;}};
}
module.exports={createAutoArchive,TIMES,CHANNEL,GATE_CHANNEL,FOLDER};
