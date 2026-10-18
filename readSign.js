const crypto = require('node:crypto');
const emailOK = v => typeof v === 'string' && v.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v);
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const publishRole = e => ['Supervisor', 'Manager'].includes(e.position);
function signatureSVG(strokes) {
  if (!Array.isArray(strokes) || !strokes.length || strokes.length > 60) fail('Draw your handwritten signature.');
  let points = 0, length = 0;
  const paths = strokes.map(stroke => {
    if (!Array.isArray(stroke) || stroke.length < 2) fail('Draw your handwritten signature.');
    points += stroke.length;
    if (points > 5000) fail('Signature is too large. Please clear and sign again.');
    return stroke.map((p, i) => {
      if (!Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || n < 0 || n > 1)) fail('Invalid signature coordinates.');
      if (i) length += Math.hypot(p[0] - stroke[i-1][0], p[1] - stroke[i-1][1]);
      return `${i ? 'L' : 'M'}${(p[0]*600).toFixed(2)},${(p[1]*200).toFixed(2)}`;
    }).join(' ');
  });
  if (points < 6 || length < .15) fail('Draw your full handwritten signature.');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><g fill="none" stroke="#102c48" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${paths.map(d => `<path d="${d}"/>`).join('')}</g></svg>`;
}
function createReadSignStore({employees, profiles, now = () => new Date()}) {
  const db = employees.db;
  db.exec(`CREATE TABLE IF NOT EXISTS read_sign_memos(id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, publisher_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS read_sign_attachments(id TEXT PRIMARY KEY, memo_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, bytes BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS read_sign_signatures(memo_id TEXT NOT NULL, employee_id TEXT NOT NULL, name TEXT NOT NULL, signed_at TEXT NOT NULL, svg TEXT NOT NULL, PRIMARY KEY(memo_id,employee_id));
    CREATE TABLE IF NOT EXISTS read_sign_mail(memo_id TEXT NOT NULL, employee_id TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL, error TEXT, sent_at TEXT, last_attempt TEXT, PRIMARY KEY(memo_id,employee_id));`);
  const employee = user => { const e = profiles.linked(user); if (!e?.name) fail('Link your employee profile first.',403); return e; };
  const get = id => { const r = db.prepare('SELECT data FROM read_sign_memos WHERE id=?').get(id); if (!r) fail('Read & Sign not found.',404); return JSON.parse(r.data); };
  const summary = (r,e) => {
    const signatures = db.prepare('SELECT employee_id,signed_at FROM read_sign_signatures WHERE memo_id=?').all(r.id);
    const mine = signatures.find(s => s.employee_id === e.id), required = r.roster.some(p => p.id === e.id);
    return {...r,roster:undefined,body:undefined,attachments:undefined,required,total:r.roster.length,signed:signatures.length,mySignedAt:mine?.signed_at||null,myStatus:mine?'signed':!required?'not-required':new Date(r.deadline)<now()?'overdue':'pending'};
  };
  const read = (user,id) => {
    const e=employee(user),r=get(id),signatures=db.prepare('SELECT * FROM read_sign_signatures WHERE memo_id=?').all(id);
    const delivery=db.prepare('SELECT employee_id,status FROM read_sign_mail WHERE memo_id=?').all(id);
    return {...r,...summary(r,e),body:r.body,attachments:r.attachments,canPublish:publishRole(e),roster:r.roster.map(p=>{
      const s=signatures.find(s=>s.employee_id===p.id);return {...p,signedAt:s?.signed_at||null,signature:s?'data:image/svg+xml;base64,'+Buffer.from(s.svg).toString('base64'):null,late:s?new Date(s.signed_at)>new Date(r.deadline):false,emailStatus:delivery.find(d=>d.employee_id===p.id)?.status||'missing-email'};
    })};
  };
  const publish = db.transaction((user,body) => {
    const e=employee(user);if(!publishRole(e))fail('Only Supervisors and Managers can publish Read & Sign.',403);
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId||''))fail('Invalid publish reference.');
    const publishHash=crypto.createHash('sha256').update(JSON.stringify([body.subject,body.memoNumber,body.body,body.deadline,body.attachments])).digest('hex');
    const previous=db.prepare('SELECT id,publisher_id FROM read_sign_memos WHERE request_id=?').get(body.requestId);
    if(previous){if(previous.publisher_id!==e.id||get(previous.id).publishHash!==publishHash)fail('Publish reference already used. Reload to check the published memo before starting a new one.',409);return read(user,previous.id);}
    for(const [key,max] of [['subject',180],['body',20000]])if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>max)fail(`Enter ${key} (maximum ${max} characters).`);
    if(typeof body.memoNumber!=='string'||body.memoNumber.length>100)fail('Memo number must be at most 100 characters.');
    if(typeof body.deadline!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(body.deadline)||!Number.isFinite(Date.parse(body.deadline))||new Date(body.deadline)<=now())fail('Choose a future deadline.');
    if(!Array.isArray(body.attachments)||body.attachments.length>5)fail('Attach up to 5 files.');
    let total=0;const files=body.attachments.map(f=>{
      if(typeof f.name!=='string'||!f.name.trim()||f.name.length>150||/[\x00-\x1f\/\\]/.test(f.name)||!['application/pdf','image/png','image/jpeg','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(f.type)||typeof f.data!=='string'||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data))fail('Use PDF, PNG, JPG, WebP, TXT, DOCX or XLSX attachments.');
      const bytes=Buffer.from(f.data,'base64');total+=bytes.length;if(!bytes.length||total>10*1024*1024)fail('Attachments must total at most 10 MB.');
      return {id:crypto.randomUUID(),name:f.name,type:f.type,size:bytes.length,bytes};
    });
    const roster=employees.get().employees.filter(e=>e.name).map(({id,name,eid})=>({id,name,eid}));
    const r={id:crypto.randomUUID(),publishHash,subject:body.subject.trim(),body:body.body.trim(),memoNumber:body.memoNumber.trim(),deadline:new Date(body.deadline).toISOString(),publishedAt:now().toISOString(),publisher:{id:e.id,name:e.name,position:e.position},roster,attachments:files.map(({bytes,...meta})=>meta)};
    db.prepare('INSERT INTO read_sign_memos VALUES(?,?,?,?)').run(r.id,body.requestId,e.id,JSON.stringify(r));
    for(const f of files)db.prepare('INSERT INTO read_sign_attachments VALUES(?,?,?,?,?)').run(f.id,r.id,f.name,f.type,f.bytes);
    for(const person of employees.get().employees.filter(e=>e.name)){
      const address=[person.companyEmail,person.email].find(emailOK)||'';
      db.prepare('INSERT INTO read_sign_mail(memo_id,employee_id,recipient,status) VALUES(?,?,?,?)').run(r.id,person.id,address,address?'pending':'missing-email');
    }
    return read(user,r.id);
  });
  return {db,employee,get,read,publish,list(user){const e=employee(user);return {employee:{id:e.id,name:e.name,position:e.position||'Agent'},canPublish:publishRole(e),memos:db.prepare('SELECT data FROM read_sign_memos ORDER BY rowid DESC').all().map(row=>summary(JSON.parse(row.data),e))};},
    sign:db.transaction((user,id,body)=>{const e=employee(user),r=get(id);if(!r.roster.some(p=>p.id===e.id))fail('You were not assigned to this memo.',403);if(body.acknowledged!==true)fail('Confirm that you have read and understood this memo.');if(db.prepare('SELECT 1 FROM read_sign_signatures WHERE memo_id=? AND employee_id=?').get(id,e.id))return read(user,id);const svg=signatureSVG(body.strokes);db.prepare('INSERT INTO read_sign_signatures VALUES(?,?,?,?,?)').run(id,e.id,r.roster.find(p=>p.id===e.id).name,now().toISOString(),svg);return read(user,id);}),
    attachment(user,id,fileId){employee(user);get(id);const f=db.prepare('SELECT * FROM read_sign_attachments WHERE memo_id=? AND id=?').get(id,fileId);if(!f)fail('Attachment not found.',404);return f;}
  };
}
function emailHTML(memo){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const link=new URL('/read-sign.html?memo='+encodeURIComponent(memo.id),process.env.PUBLIC_APP_URL||'https://www.mufcapp.net').href;
  const deadline=new Date(memo.deadline).toLocaleString('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'})+' PT';
  const files=memo.attachments.length?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #e3eaf2"><tr><td style="padding-top:20px;color:#678099;font-size:11px;letter-spacing:1px">ATTACHMENTS · OPEN ON THE PAGE</td></tr>${memo.attachments.map(f=>`<tr><td style="padding:12px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#254663">▤ &nbsp;${esc(f.name)}</td></tr>`).join('')}</table>`:'';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Read &amp; Sign</title></head><body style="margin:0;padding:28px 12px;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#18344e"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #dbe4ee;border-radius:12px;overflow:hidden"><tr><td style="background:#061d32;padding:28px 32px;color:#ffffff"><strong style="font-size:23px;letter-spacing:1px">HMMU</strong><span style="display:block;color:#9bb8d2;font-size:11px;margin-top:6px">China Eastern · LAX</span></td></tr><tr><td style="padding:30px 32px"><p style="margin:0 0 14px;color:#367ebc;font-size:11px;font-weight:bold;letter-spacing:1.5px">READ &amp; SIGN · ALL STAFF</p><h1 style="margin:0 0 22px;font-size:24px;line-height:1.4;color:#112f4b">${esc(memo.subject)}</h1><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f7fc;border-left:3px solid #3f8ac9"><tr><td style="padding:16px 18px;color:#56718b;font-size:12px;line-height:1.9">Published by <strong style="color:#244764">${esc(memo.publisher.name)}</strong>${memo.memoNumber?`<br>Memo # ${esc(memo.memoNumber)}`:''}<br><strong style="color:#a16b18">Please sign by ${esc(deadline)}</strong></td></tr></table><div style="padding-top:24px;font-size:14px;line-height:1.9;color:#35516a;overflow-wrap:anywhere">${esc(memo.body).replace(/\r?\n/g,'<br>')}</div>${files}<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr><td bgcolor="#2265a0" style="border-radius:7px;text-align:center"><a href="${esc(link)}" style="display:inline-block;padding:15px 25px;border:1px solid #2265a0;border-radius:7px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;mso-padding-alt:15px 25px">Open Read &amp; Sign →</a></td></tr></table><p style="margin:16px 0 0;color:#71869a;font-size:12px;line-height:1.8">Sign in with your linked employee account, review the memo and attachments, then add your handwritten signature.</p></td></tr><tr><td style="padding:20px 32px;background:#f7f9fc;border-top:1px solid #e5ebf2;font-size:11px;color:#7b8fa2;line-height:1.8">Button not working? Open this link:<br><a href="${esc(link)}" style="color:#377aa9;word-break:break-all">${esc(link)}</a><br><br>HMMU · China Eastern<br>This notification was sent to all employees. Your signature is recorded under your own employee account.</td></tr></table></td></tr></table></body></html>`;
}
function mailContent(memo, recipient) {
  const link=new URL('/read-sign.html?memo='+encodeURIComponent(memo.id),process.env.PUBLIC_APP_URL||'https://www.mufcapp.net').href;
  const text=`Read & Sign: ${memo.subject}\n\nPublished by ${memo.publisher.name}\nDeadline: ${new Date(memo.deadline).toLocaleString('en-US',{timeZone:'America/Los_Angeles'})} PT\n\n${memo.body}\n\nAttachments: ${memo.attachments.map(f=>f.name).join(', ')||'None'}\n\nRead the memo, open attachments and sign here:\n${link}\n\nSign in with your linked employee account. Your handwritten signature is required.`;
  const chunks=[];let chunk='';for(const c of 'Read & Sign: '+memo.subject){if(Buffer.byteLength(chunk+c)>42){chunks.push(chunk);chunk='';}chunk+=c;}if(chunk)chunks.push(chunk);
  const subject=chunks.map(c=>'=?UTF-8?B?'+Buffer.from(c).toString('base64')+'?=').join('\r\n ');
  const boundary='read_sign_'+memo.id,encode=value=>Buffer.from(value).toString('base64').match(/.{1,76}/g).join('\r\n');
  return [`To: ${recipient}`,`Subject: ${subject}`,'MIME-Version: 1.0',`Content-Type: multipart/alternative; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encode(text),`--${boundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',encode(emailHTML(memo)),`--${boundary}--`].join('\r\n');
}
async function sendReadSignEmail(memo,recipient){const {gmail,userId}=require('./googleDrive').getNextDayInfoGmailClient();const response=await gmail.users.messages.send({userId,requestBody:{raw:Buffer.from(mailContent(memo,recipient)).toString('base64url')}},{timeout:30000,retry:false});if(!response.data.id)throw Error('No Gmail delivery acknowledgement.');}
function registerReadSign(app,{employees,profiles,authenticate,now,send=sendReadSignEmail}){
  const store=createReadSignStore({employees,profiles,now});let running=false;
  async function retry(){if(running)return;running=true;try{
    for(const missing of store.db.prepare("SELECT memo_id,employee_id FROM read_sign_mail WHERE status='missing-email'").all()){
      const e=employees.get().employees.find(e=>e.id===missing.employee_id),recipient=[e?.companyEmail,e?.email].find(emailOK);
      if(recipient)store.db.prepare("UPDATE read_sign_mail SET recipient=?,status='pending' WHERE memo_id=? AND employee_id=?").run(recipient,missing.memo_id,missing.employee_id);
    }
    const jobs=store.db.prepare("SELECT * FROM read_sign_mail WHERE status IN ('pending','failed') ORDER BY last_attempt ASC LIMIT 40").all();
    for(const job of jobs){const e=employees.get().employees.find(e=>e.id===job.employee_id),recipient=[e?.companyEmail,e?.email].find(emailOK);if(!recipient){store.db.prepare("UPDATE read_sign_mail SET status='missing-email',recipient='' WHERE memo_id=? AND employee_id=?").run(job.memo_id,job.employee_id);continue;}
      store.db.prepare('UPDATE read_sign_mail SET last_attempt=? WHERE memo_id=? AND employee_id=?').run(new Date().toISOString(),job.memo_id,job.employee_id);
      try{await send(store.get(job.memo_id),recipient);store.db.prepare("UPDATE read_sign_mail SET status='sent',recipient=?,sent_at=?,error=NULL WHERE memo_id=? AND employee_id=?").run(recipient,new Date().toISOString(),job.memo_id,job.employee_id);}
      catch(error){store.db.prepare("UPDATE read_sign_mail SET status='failed',error=? WHERE memo_id=? AND employee_id=?").run(String(error.message).slice(0,500),job.memo_id,job.employee_id);}
    }
  }finally{running=false;}}
  app.use('/read-sign-api',require('express').json({limit:'15mb'}),async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.readSignUser=await authenticate(req);next();}catch{res.status(401).json({error:'Sign in required.'});}});
  const handle=fn=>async(req,res)=>{try{const data=await fn(req,res);if(!res.headersSent)res.json(data);}catch(e){if(!res.headersSent)res.status(e.status||400).json({error:e.message});}};
  app.get('/read-sign-api',handle(req=>store.list(req.readSignUser)));
  app.post('/read-sign-api',handle(req=>{const r=store.publish(req.readSignUser,req.body);void retry().catch(e=>console.error('Read & Sign email retry:',e.message));return r;}));
  app.get('/read-sign-api/:id',handle(req=>store.read(req.readSignUser,req.params.id)));
  app.post('/read-sign-api/:id/sign',handle(req=>store.sign(req.readSignUser,req.params.id,req.body)));
  app.get('/read-sign-api/:id/attachments/:file',handle((req,res)=>{const f=store.attachment(req.readSignUser,req.params.id,req.params.file);res.set('X-Content-Type-Options','nosniff').set('Content-Disposition',`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(f.name).replace(/'/g,'%27')}`).type(f.type).send(f.bytes);}));
  const timer=setInterval(()=>void retry().catch(e=>console.error('Read & Sign mail retry:',e.message)),60000);timer.unref();void retry();return {store,retry,close:()=>clearInterval(timer)};
}
module.exports={createReadSignStore,registerReadSign,signatureSVG,mailContent,emailHTML};
