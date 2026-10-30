const crypto=require('node:crypto');
const groups=require('./public/public/employee-account-groups'),positions=require('./public/public/employee-positions');
const emailOK=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const encodedSubject=value=>/^[\x20-\x7e]*$/.test(value)?value:'=?UTF-8?B?'+Buffer.from(value).toString('base64')+'?=';
const decodedSubject=value=>String(value||'').replace(/(\?=)\s+(=\?)/g,'$1$2').replace(/=\?utf-8\?b\?([^?]+)\?=/gi,(_,part)=>Buffer.from(part,'base64').toString('utf8'));
function problemMessage(report,to,key){
 const reference='PBB-NO-'+key.slice(0,20);
 return {to,subject:`Jet Bridge NO report - ${report.station}/${report.account} - ${reference}`,photo:report.photo,
  text:[`Jet Bridge problem report (${reference})`,`Station / Account: ${report.station} / ${report.account}`,`Operation: ${report.type}`,`Flight: ${report.flightNo}`,`Date: ${report.date}`,`Gate: ${report.gate} | Bridge: ${report.bridge}`,`Reported by: ${report.name} (${report.role})`,`Reported at: ${report.at}`,'',`Question: ${report.question}`,'Answer at submission: NO','',report.reason,'','The problem photo is attached.','This email records the report at submission. Open HAS Jet Bridge to review subsequent updates.','https://www.mufcapp.net/has-pbb.html'].join('\n')};
}
function mime(message,key,userId){
 if(!emailOK(message.to)||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(message.photo))throw Error('Invalid problem email recipient or photo.');
 const boundary='has_pbb_'+key,encoded=value=>Buffer.from(value,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
 return ['From: HAS Jet Bridge <'+(userId==='me'?'laxhmmu@gmail.com':userId)+'>','To: '+message.to,'Message-ID: <has-pbb-'+key+'@mufcapp.net>','Subject: '+encodedSubject(message.subject),'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encoded(message.text),`--${boundary}`,'Content-Type: image/jpeg','Content-Disposition: attachment; filename="jet-bridge-problem.jpg"','Content-Transfer-Encoding: base64','',message.photo.split(',')[1].match(/.{1,76}/g).join('\r\n'),`--${boundary}--`].join('\r\n');
}
function createSender(getClient=()=>require('./googleDrive').getNextDayInfoGmailClient()){
 return async(message,key)=>{
  const {gmail,userId}=await getClient();
  // Reconcile a lost Gmail acknowledgement before retrying; Gmail may replace Message-ID.
  const listed=await gmail.users.messages.list({userId,q:'in:sent to:'+message.to+' subject:'+(message.subject.match(/PBB-NO-[0-9a-f]{20}/)?.[0]||key),maxResults:20},{timeout:30000});
  for(const candidate of listed.data.messages||[]){
   const found=await gmail.users.messages.get({userId,id:candidate.id,format:'metadata',metadataHeaders:['Subject','To']},{timeout:30000});
   const headers=Object.fromEntries((found.data.payload?.headers||[]).map(h=>[h.name.toLowerCase(),h.value]));
   const recipients=String(headers.to||'').toLowerCase().split(',').map(value=>value.match(/<([^>]+)>/)?.[1]||value.trim());
   if(decodedSubject(headers.subject)===message.subject&&recipients.includes(message.to.toLowerCase()))return candidate.id;
  }
  const response=await gmail.users.messages.send({userId,requestBody:{raw:Buffer.from(mime(message,key,userId)).toString('base64url')}},{timeout:30000,retry:false});
  if(!response.data.id)throw Error('No Gmail delivery acknowledgement.');return response.data.id;
 };
}
function createProblemMailer({db,employees,now=()=>new Date(),sendEmail=createSender()}){
 db.exec("CREATE TABLE IF NOT EXISTS has_pbb_problem_mail(id TEXT PRIMARY KEY,data TEXT NOT NULL,sent TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL,next_attempt_at TEXT NOT NULL,lease_until TEXT,lease_owner TEXT);CREATE INDEX IF NOT EXISTS has_pbb_problem_mail_due ON has_pbb_problem_mail(status,next_attempt_at)");
 let busy=false,closed=false;
 function enqueue(record,role,itemId){
  const report=record.evidence?.[role]?.[itemId];if(!report)throw Error('Problem evidence required.');
  const id=hash(JSON.stringify([record.id,record.resetToken||'',role,itemId,report.reportId||report.at]));
  const item=require('./public/public/has-pbb-data').find(q=>q.id===itemId&&q.type===record.type),at=now().toISOString();
  const data={recordId:record.id,resetToken:record.resetToken||'',station:record.station,account:record.account,type:record.type,date:record.date,flightNo:record.flightNo,gate:record.gate,bridge:record.bridge,role,itemId,question:item?.text||itemId,...report};
  db.prepare('INSERT OR IGNORE INTO has_pbb_problem_mail(id,data,created_at,next_attempt_at) VALUES(?,?,?,?)').run(id,JSON.stringify(data),at,at);return id;
 }
 async function tick(){
  if(busy||closed)return;busy=true;
  try{const instant=now().toISOString(),rows=db.prepare("SELECT * FROM has_pbb_problem_mail WHERE status<>'sent' AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY next_attempt_at,created_at LIMIT 25").all(instant,instant);
   for(const row of rows){
    if(closed)return;const owner=crypto.randomUUID(),lease=()=>new Date(now().getTime()+300000).toISOString();
    const claimed=db.prepare("UPDATE has_pbb_problem_mail SET status='sending',lease_until=?,lease_owner=?,attempts=attempts+1 WHERE id=? AND status<>'sent' AND (lease_until IS NULL OR lease_until<=?)").run(lease(),owner,row.id,instant);if(!claimed.changes)continue;
    const report=JSON.parse(row.data),sent=JSON.parse(row.sent),errors=[];let waitingRecipient=false;
    try{
     const managers=employees.get().employees.filter(e=>positions.normalize(e.position)==='Business Manager'&&!groups.isHeadquarter(e)&&groups.same(groups.scope(e),report));
     const recipients=[...new Set(managers.map(e=>String(e.companyEmail||'').trim().toLowerCase()).filter(emailOK))],missing=managers.filter(e=>!emailOK(String(e.companyEmail||'').trim()));
     waitingRecipient=!managers.length||missing.length>0;
     if(!managers.length)errors.push('No Business Manager configured for this station/account.');
     if(missing.length)errors.push('Business Manager HAS email is missing or invalid.');
     for(const to of recipients){if(sent[to])continue;if(closed)return;db.prepare('UPDATE has_pbb_problem_mail SET lease_until=? WHERE id=? AND lease_owner=?').run(lease(),row.id,owner);
      try{const messageId=await sendEmail(problemMessage(report,to,row.id),hash(row.id+':'+to));if(!messageId)throw Error('No mail delivery acknowledgement.');if(closed)return;sent[to]=messageId;db.prepare('UPDATE has_pbb_problem_mail SET sent=? WHERE id=? AND lease_owner=?').run(JSON.stringify(sent),row.id,owner);}catch(error){errors.push(error.message||String(error));}
     }
    }catch(error){errors.push(error.message||String(error));}
    if(closed)return;const done=!errors.length,next=new Date(now().getTime()+(done?0:waitingRecipient?60000:Math.min(900000,60000*Math.pow(2,Math.min(row.attempts,4))))).toISOString();
    db.prepare('UPDATE has_pbb_problem_mail SET status=?,error=?,next_attempt_at=?,lease_until=NULL,lease_owner=NULL WHERE id=? AND lease_owner=?').run(done?'sent':'pending',errors.join(' ').slice(0,2000)||null,next,row.id,owner);
   }
  }finally{busy=false;}
 }
 const timer=setInterval(()=>void tick().catch(()=>{}),30000);timer.unref?.();
 return {enqueue,tick,close(){closed=true;clearInterval(timer);}};
}
module.exports={createProblemMailer,createSender,problemMessage,mime};
