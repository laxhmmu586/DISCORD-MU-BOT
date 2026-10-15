const crypto = require('node:crypto');
const RECIPIENT = 'Lake.Xia@hallmark-aviation.com';
const CC = 'Chuyang.Tan@hallmark-aviation.com';
const SUBJECT = 'A new case has been assigned to your department!';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function validate(body, employees) {
  const bad = () => { const e = new Error('Invalid feedback. Check all fields and select a current staff nickname.'); e.status=400; throw e; };
  if (!body || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId || '') || !['praise','complaint'].includes(body.type)) bad();
  for (const [key,min,max] of [['name',1,100],['details',20,10000],['seat',2,4]]) if(typeof body[key]!=='string'||[...body[key].trim()].length<min||body[key].length>max) bad();
  if (!/^\d{1,3}[A-Za-z]$/.test(body.seat.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date||'') || !Number.isFinite(Date.parse(body.date)) || new Date(body.date).toISOString().slice(0,10)!==body.date) bad();
  const employee=employees.get().employees.find(e=>e.id===body.employeeId&&e.nickname?.trim());
  if(!employee) bad();
  return {type:body.type,name:body.name.trim(),date:body.date,seat:body.seat.trim().toUpperCase(),details:body.details.trim(),nickname:employee.nickname.trim()};
}
function email(record) {
  const type=record.type==='praise'?'Praise':'Complaint';
  const rows=[['Feedback type',type],['Passenger',record.name],['Travel date',record.date],['Seat',record.seat],['Staff member',record.nickname]];
  const submitted=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'}).format(new Date(record.submittedAt));
  return {to:RECIPIENT,cc:CC,subject:SUBJECT,html:`<!doctype html><html><body style="margin:0;background:#f6f4f0;font-family:Arial,sans-serif;color:#142739"><div style="max-width:640px;margin:24px auto;background:white;padding:36px;border-top:5px solid #142739"><p style="color:#8d7549;letter-spacing:2px">PASSENGER FEEDBACK</p><h1 style="font-size:26px">Passenger Feedback Report</h1><p>Dear Lake,</p><p>A passenger ${type==='Praise'?'compliment':'complaint'} has been submitted for your review.</p><table style="width:100%;border-collapse:collapse">${rows.map(([label,value])=>`<tr><th align="left" style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:normal;color:#65737d">${label}</th><td style="padding:12px;border-bottom:1px solid #ddd">${escape(value)}</td></tr>`).join('')}</table><h2 style="font-size:17px;margin-top:30px">Passenger’s original feedback</h2><div style="padding:20px;background:#f6f4f0;white-space:pre-wrap;line-height:1.7">${escape(record.details)}</div><p style="font-size:12px;color:#65737d;margin-top:30px">Submitted: ${escape(submitted)} (Los Angeles)<br>Automated Passenger Feedback System</p></div></body></html>`};
}
async function sendFeedbackEmail(message) {
  const {gmail,userId}=require('./googleDrive').getNextDayInfoGmailClient();
  const raw=[`To: ${RECIPIENT}`,`Cc: ${CC}`,`Subject: ${SUBJECT}`,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(message.html).toString('base64')].join('\r\n');
  const result=await gmail.users.messages.send({userId,requestBody:{raw:Buffer.from(raw).toString('base64url')}},{timeout:30000,retry:false});
  if(!result.data.id) throw new Error('No Gmail acknowledgement');
  return result.data.id;
}
function discordPayload(record) {
  const fields=[['Feedback type',record.type==='praise'?'Praise':'Complaint'],['Traveler name',record.name],['Travel date',record.date],['Seat number',record.seat],[record.type==='praise'?'表扬对象':'投诉对象',record.nickname],['体验反馈',record.details]].flatMap(([name,value])=>{
    const chunks=String(value).match(/[\s\S]{1,1024}/g)||['—'];return chunks.map((value,i)=>({name:name+(i?' (cont.)':''),value,inline:false}));
  });
  // Discord limits the total embed text to 6000; retain every character across messages.
  const messages=[];let group=[],size=100;
  for(const field of fields){if(size+field.name.length+field.value.length>5900){messages.push(group);group=[];size=100;}group.push(field);size+=field.name.length+field.value.length;}
  if(group.length)messages.push(group);
  return messages.map(fields=>({content:'📋 New Customer Feedback Submission',embeds:[{title:'The case has been forwarded to your attention.',color:33023,fields,footer:{text:'Submit Time:'},timestamp:record.submittedAt}],allowedMentions:{parse:[]}}));
}
function registerFeedback(app,{employees,db,client,send=sendFeedbackEmail,now=()=>new Date()}) {
  // Receipts contain hashes and delivery status only, never passenger text or names.
  db.exec('CREATE TABLE IF NOT EXISTS feedback_delivery (id TEXT PRIMARY KEY, hash TEXT NOT NULL, status TEXT NOT NULL, submittedAt TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS feedback_discord_queue (id TEXT PRIMARY KEY, payload TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0)');
  const active=new Map(),limits=new Map();
  let draining=false;
  async function drain(){
    if(draining||!client)return;draining=true;
    try{const jobs=db.prepare('SELECT * FROM feedback_discord_queue ORDER BY rowid LIMIT 20').all();if(!jobs.length)return;
      const channel=await client.channels.fetch('1371154197155807232');
      for(const job of jobs){const messages=JSON.parse(job.payload);for(let i=job.position;i<messages.length;i++){
        const nonce=crypto.createHash('sha256').update(job.id+':'+i).digest('hex').slice(0,24);
        await channel.send({...messages[i],nonce,enforceNonce:true});
        db.prepare('UPDATE feedback_discord_queue SET position=? WHERE id=?').run(i+1,job.id);
      }db.prepare('DELETE FROM feedback_discord_queue WHERE id=?').run(job.id);}
    }catch(e){console.error('Feedback Discord delivery pending:',e.code||'unacknowledged');}finally{draining=false;}
  }
  const timer=client?setInterval(drain,60000):null;timer?.unref();
  app.get('/feedback-api/employees',(_req,res)=>res.set('Cache-Control','no-store').json({employees:employees.get().employees.filter(e=>e.nickname?.trim()).map(e=>({id:e.id,nickname:e.nickname.trim()}))}));
  app.post('/feedback-api/submit',async(req,res)=>{
    res.set('Cache-Control','no-store');
    try {
      const record=validate(req.body,employees),id=req.body.requestId;
      const hash=crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
      const prior=db.prepare('SELECT * FROM feedback_delivery WHERE id=?').get(id);
      if(prior&&prior.hash!==hash)return res.status(409).json({error:'REQUEST_CHANGED'});
      if(prior?.status==='sent')return res.json({ok:true,submittedAt:prior.submittedAt});
      if(active.has(id))return res.json(await active.get(id));
      if(prior)return res.status(409).json({error:'DELIVERY_UNCERTAIN'});
      // Production nginx overwrites X-Real-IP. Trust it only from local proxy sockets.
      const remote=req.socket.remoteAddress;
      const key=(['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)&&require('node:net').isIP(req.get('X-Real-IP')||''))?req.get('X-Real-IP'):remote;
      const timestamp=now().getTime();
      for(const [ip,item] of limits)if(timestamp-item.start>3600000)limits.delete(ip);
      const limit=limits.get(key)||{start:timestamp,count:0};
      if(limit.count>=5)return res.status(429).json({error:'RATE_LIMIT'});
      limit.count++;limits.set(key,limit);
      if(req.body.website)return res.status(400).json({error:'INVALID_REQUEST'});
      record.submittedAt=now().toISOString();
      db.prepare('INSERT INTO feedback_delivery(id,hash,status,submittedAt) VALUES (?,?,?,?)').run(id,hash,'sending',record.submittedAt);
      const work=(async()=>{await send(email(record));db.transaction(()=>{db.prepare("UPDATE feedback_delivery SET status='sent' WHERE id=?").run(id);if(client)db.prepare('INSERT INTO feedback_discord_queue(id,payload) VALUES (?,?)').run(id,JSON.stringify(discordPayload(record)));})();void drain();return {ok:true,submittedAt:record.submittedAt};})();
      active.set(id,work);
      try{res.json(await work);}finally{active.delete(id);}
    } catch(e) { if(!e.status)console.error('Feedback email delivery failed:',e.code||'unacknowledged');res.status(e.status||502).json({error:e.status?'INVALID_REQUEST':'DELIVERY_UNCERTAIN'}); }
  });
  return {drain,close:()=>clearInterval(timer)};
}
module.exports={registerFeedback,validate,email,discordPayload,RECIPIENT,CC,SUBJECT};
