const {PDFDocument}=require('./vendor/pdf-lib/pdf-lib');
const SPREADSHEET_ID='1-BnQrtRj6-uTgoC89uj8zQ1dZTcSh96QFRH-_Tf4JEQ';
const JOBS=[
 {flight:'MU583',sheet:'ARRIVAL',channelId:'1563411695936864447'},
 {flight:'MU586',sheet:'DEPARTURE',channelId:'1563411615351574528'}
];
const legacyChannels=new Set(['1252032351131799654','1252032370920656907',...JOBS.map(j=>j.channelId)]);
function isLegacyBriefing(body){return legacyChannels.has(String(body.channelId))&&/\bMU(?:583|586)\b.*\bBRIEFING SHEET\.pdf$/i.test(body.file?.name||'');}
function localDate(now){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');}
async function validatePdf(bytes){
 if(bytes.length>8*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid briefing PDF export');
 const doc=await PDFDocument.load(bytes);
 if(doc.getPageCount()!==1||doc.getPages()[0].getWidth()>=doc.getPages()[0].getHeight())throw Error('Briefing export must be one portrait page');
 return bytes;
}
function createGoogleExporter({getSheets,getClient}){
 return async job=>{
  if(!JOBS.some(j=>j.sheet===job.sheet&&j.flight===job.flight))throw Error('Unknown briefing sheet');
  const sheets=getSheets(),meta=await sheets.spreadsheets.get({spreadsheetId:SPREADSHEET_ID,fields:'sheets.properties(sheetId,title)'},{timeout:30000});
  const sheet=meta.data.sheets.find(s=>s.properties.title===job.sheet);if(!sheet)throw Error('Missing briefing sheet: '+job.sheet);
  const query=new URLSearchParams({format:'pdf',gid:String(sheet.properties.sheetId),range:'A1:R67',size:'letter',portrait:'true',scale:'4',sheetnames:'false',printtitle:'false',pagenum:'UNDEFINED',gridlines:'false',fzr:'false',horizontal_alignment:'CENTER',vertical_alignment:'TOP',top_margin:'0.10',bottom_margin:'0.10',left_margin:'0.10',right_margin:'0.10'});
  const client=await getClient(),response=await client.request({url:'https://docs.google.com/spreadsheets/d/'+SPREADSHEET_ID+'/export?'+query,responseType:'arraybuffer',timeout:30000,retry:false});
  return {bytes:await validatePdf(Buffer.from(response.data)),viewUrl:'https://docs.google.com/spreadsheets/d/'+SPREADSHEET_ID+'/edit#gid='+sheet.properties.sheetId};
 };
}
function createBriefingService({db,client,exportPdf,includeArrival=true,now=()=>new Date(),logger=console}){
 let busy=false,timer;
 const existing=async(channel,name)=>{
  const messages=await channel.messages.fetch({limit:100});
  return messages.find(m=>m.author?.id===client.user.id&&[...m.attachments.values()].some(a=>a.name===name));
 };
 async function tick(){
  if(busy||client.isReady&&!client.isReady())return;
  const current=now();if(current.getUTCHours()*60+current.getUTCMinutes()<15*60+49)return;
  const date=localDate(current);busy=true;
  try{
   db.exec('CREATE TABLE IF NOT EXISTS briefing_deliveries(date TEXT,flight TEXT,state TEXT NOT NULL,attempted INTEGER NOT NULL,message_id TEXT,error TEXT,PRIMARY KEY(date,flight))');
   for(const job of JOBS.filter(job=>includeArrival||job.sheet!=='ARRIVAL')){
    const name=date+' '+job.flight+' '+job.sheet+' BRIEFING SHEET.pdf';let phase='preparing';
    try{
     const old=db.prepare('SELECT * FROM briefing_deliveries WHERE date=? AND flight=?').get(date,job.flight);
     if(old?.state==='sent')continue;
     if(old&&['sending','uncertain'].includes(old.state)){
      phase='sending';
      // A timeout/crash may already have posted. Reconcile; never blindly resend.
      const channel=await client.channels.fetch(job.channelId),found=await existing(channel,name);
      if(found)db.prepare("UPDATE briefing_deliveries SET state='sent',message_id=?,error=NULL WHERE date=? AND flight=?").run(found.id,date,job.flight);
      continue;
     }
     const stamp=current.getTime();
     const claim=db.prepare("INSERT INTO briefing_deliveries(date,flight,state,attempted) VALUES(?,?,'preparing',?) ON CONFLICT(date,flight) DO UPDATE SET state='preparing',attempted=excluded.attempted WHERE state IN ('preparing','failed') AND attempted<?").run(date,job.flight,stamp,stamp-5*60000);
     if(!claim.changes)continue;
     const channel=await client.channels.fetch(job.channelId);
     if(typeof channel?.send!=='function')throw Error('Briefing channel unavailable: '+job.channelId);
     const found=await existing(channel,name);
     if(found){db.prepare("UPDATE briefing_deliveries SET state='sent',message_id=?,error=NULL WHERE date=? AND flight=?").run(found.id,date,job.flight);continue;}
     const exported=await exportPdf(job),bytes=await validatePdf(exported.bytes);
     const viewUrl=new URL(exported.viewUrl);
     if(viewUrl.origin!=='https://docs.google.com'||viewUrl.pathname!=='/spreadsheets/d/'+SPREADSHEET_ID+'/edit'||!/^#gid=\d+$/.test(viewUrl.hash))throw Error('Invalid briefing sheet link');
     db.prepare("UPDATE briefing_deliveries SET state='sending' WHERE date=? AND flight=?").run(date,job.flight);phase='sending';
     const result=await channel.send({content:'📄 '+name+'\n🔗 Open briefing sheet: '+viewUrl.href,files:[{attachment:bytes,name}],allowedMentions:{parse:[]}});
     if(!result.id||result.attachments?.size!==1)throw Error('Discord did not acknowledge the briefing PDF attachment');
     db.prepare("UPDATE briefing_deliveries SET state='sent',message_id=?,error=NULL WHERE date=? AND flight=?").run(result.id,date,job.flight);
    }catch(error){db.prepare('UPDATE briefing_deliveries SET state=?,error=? WHERE date=? AND flight=?').run(phase==='sending'?'uncertain':'failed',String(error.message).slice(0,500),date,job.flight);logger.error('Briefing PDF '+job.flight+':',error.message);}
   }
  }catch(error){logger.error('Briefing scheduler:',error.message);}finally{busy=false;}
 }
 return {tick,start(){if(timer)return;void tick();timer=setInterval(()=>void tick(),60000);timer.unref?.();},close(){clearInterval(timer);timer=null;}};
}
module.exports={JOBS,SPREADSHEET_ID,isLegacyBriefing,createGoogleExporter,createBriefingService,validatePdf};
