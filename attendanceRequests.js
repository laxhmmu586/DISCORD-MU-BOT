const crypto = require('node:crypto');
const POLICY = 'Notify your supervisor at least 2 hours before your shift. Speak directly with your supervisor; notifying a fellow employee or leaving a message is not sufficient.';
function bad(message) { const e = new Error(message); e.status = 400; throw e; }
function validate(body, employees) {
  if (!body || typeof body !== 'object') bad('Invalid request');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId || '')) bad('Invalid request reference');
  const employee = employees.get().employees.find(e => e.id === body.employeeId && e.name);
  if (!employee) bad('Select an employee from the current employee list');
  if (!['sick', 'late'].includes(body.type)) bad('Select a request type');
  const date = String(body.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) bad('Select a valid date');
  const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (body.type === 'late' && !time(body.arrivalTime)) bad('Enter your expected arrival time');
  for (const key of ['reason', 'note']) if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > 1000)) bad('Keep reasons and notes under 1,000 characters');
  if (typeof body.reason !== 'string' || !body.reason.trim()) bad(body.type === 'late' ? 'Please explain why you are coming late' : 'Please provide a reason for your call off / sick request');
  return { id: body.requestId, reference: 'REQ-' + date.replaceAll('-', '') + '-' + body.requestId.toUpperCase(), employeeId: employee.id, employeeName: employee.name, type: body.type, date, arrivalTime: body.type === 'late' ? body.arrivalTime : '', scheduledStart: '', reason: body.reason.trim(), note: (body.note || '').trim() };
}
const label = r => r.type === 'late' ? 'Coming Late' : 'Call Off / Sick';
function createSqliteStorage({db,onSave=()=>{}}) {
  db.exec(`CREATE TABLE IF NOT EXISTS attendance_requests (
    id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, employee_id TEXT NOT NULL,
    date TEXT NOT NULL, submitted_at TEXT NOT NULL, data TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS attendance_requests_employee_date ON attendance_requests(employee_id,date);
  CREATE TABLE IF NOT EXISTS attendance_delivery (reference TEXT PRIMARY KEY, data TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0)`);
  const insert=db.prepare('INSERT OR IGNORE INTO attendance_requests VALUES(?,?,?,?,?,?)');
  // Recover previously accepted requests from the existing durable delivery ledger.
  db.transaction(()=>{for(const job of db.prepare('SELECT data FROM attendance_delivery').all()){
    const {record}=JSON.parse(job.data);if(record?.id)insert.run(record.id,record.reference,record.employeeId,record.date,record.submittedAt,JSON.stringify(record));
  }})();
  const list=employeeId=>db.prepare('SELECT data FROM attendance_requests WHERE employee_id=? ORDER BY submitted_at DESC, rowid DESC').all(employeeId).map(row=>JSON.parse(row.data));
  return {list,save:db.transaction(record=>{
    const prior=db.prepare('SELECT data FROM attendance_requests WHERE id=?').get(record.id);
    const duplicate=Boolean(prior);
    if(prior){const original=JSON.parse(prior.data);
      if(['employeeId','type','date','arrivalTime','scheduledStart','reason','note'].some(key=>original[key]!==record[key]))throw Object.assign(Error('This reference was already used for another request. Start a new request.'),{status:409});
      record=original;
    }else insert.run(record.id,record.reference,record.employeeId,record.date,record.submittedAt,JSON.stringify(record));
    onSave(record);
    const history=list(record.employeeId).filter(row=>row.date.startsWith(record.date.slice(0,7))).map(({date,type})=>({date,type})).sort((a,b)=>a.date.localeCompare(b.date));
    const saved={record,duplicate,history};
    db.prepare('INSERT OR IGNORE INTO attendance_delivery(reference,data) VALUES (?,?)').run(record.reference,JSON.stringify(saved));
    return saved;
  })};
}
function registerAttendance(app, { employees, client, db, profiles, authenticate = require('./has/server/pbbAuth').authenticate, storage, renderCards = (...args) => require('./attendanceCards').renderCards(...args), channelId = process.env.ATTENDANCE_DISCORD_CHANNEL_ID || '1365021189998903418', now = () => new Date() }) {
  db.exec('CREATE TABLE IF NOT EXISTS attendance_delivery (reference TEXT PRIMARY KEY, data TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0)');
  const sqliteStorage=!storage;
  storage ||= createSqliteStorage({db,onSave:record=>require('./has/server/scheduleRequests').applyAttendanceToSchedule({db,employees,record})});
  const active = new Map();
  app.get('/attendance-api/history', async (req,res) => {
    res.set('Cache-Control','private, no-store');
    let user;
    try { user=await authenticate(req); } catch { return res.status(401).json({error:'Sign in required.'}); }
    const employee=profiles?.linked(user);
    if(!employee?.name)return res.status(403).json({error:'Link your employee profile first.'});
    try { res.json({records:await storage.list(employee.id)}); }
    catch { res.status(503).json({error:'Could not load attendance records. Please retry.'}); }
  });
  async function deliver(reference) {
    if (active.has(reference)) return active.get(reference);
    const work = (async () => {
      const job = db.prepare('SELECT * FROM attendance_delivery WHERE reference=?').get(reference);
      if (!job || job.sent) return;
      const { record, history } = JSON.parse(job.data);
      const employee = employees.get().employees.find(employee => employee.id === record.employeeId);
      const notificationRecord = { ...record, employeeName: String(employee?.nickname || '').trim() || record.employeeName };
      let stage = 'channel lookup';
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || typeof channel.send !== 'function') throw new Error('The configured channel cannot receive messages');
        let media;
        stage = 'image rendering';
        try {
          const files = await renderCards(notificationRecord, history);
          media = { files };
        }
        catch (error) {
          console.error('Attendance Discord image fallback:', { reference, channelId, error: error.message });
          media = { embeds: require('./attendanceDiscord').fallbackEmbeds(notificationRecord, history) };
        }
        stage = 'message send';
        const discordId = String(employees.get().employees.find(employee => employee.id === record.employeeId)?.discordId || '').trim();
        const mention = /^\d{17,20}$/.test(discordId) ? discordId : '';
        const message = await channel.send({ ...(mention ? { content: `<@${mention}>` } : {}), ...media, allowedMentions: { parse: [], users: mention ? [mention] : [] }, nonce: crypto.createHash('sha256').update(reference).digest('hex').slice(0,24), enforceNonce: true });
        stage = 'delivery acknowledgement';
        db.prepare('UPDATE attendance_delivery SET sent=1 WHERE reference=?').run(reference);
        console.info('Attendance Discord delivered:', { reference, channelId, messageId: message?.id, format: media.files ? 'images' : 'native cards' });
      } catch (error) {
        console.error('Attendance Discord failure:', { reference, channelId, stage, code: error.code, status: error.status, error: error.message });
        throw error;
      }
    })().finally(() => active.delete(reference));
    active.set(reference, work); return work;
  }
  app.get('/attendance-api/employees', (_req, res) => { res.set('Cache-Control', 'no-store').json({ employees: employees.get().employees.filter(e => e.name).map(({ id, name, nickname }) => ({ id, name: String(nickname || '').trim() || name })) }); });
  app.post('/attendance-api/requests', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let saved;
    try {
      const record = { ...validate(req.body, employees), submittedAt: now().toISOString() };
      saved = await storage.save(record);
      if(!sqliteStorage)require('./has/server/scheduleRequests').applyAttendanceToSchedule({db,employees,record:saved.record});
    } catch (e) {
      if (!e.status) console.error('Attendance SQLite save failed:', e.message);
      return res.status(e.status || 503).json({ error: e.status ? e.message : 'Could not save your request. Please retry with this page open.' });
    }
    let notificationPending = true;
    try {
      db.prepare('INSERT OR IGNORE INTO attendance_delivery(reference,data) VALUES (?,?)').run(saved.record.reference, JSON.stringify(saved));
      let deadline;
      try {
        notificationPending = await Promise.race([
          deliver(saved.record.reference).then(() => false),
          new Promise(resolve => { deadline = setTimeout(() => resolve(true), 8000); })
        ]);
      } finally { clearTimeout(deadline); }
    } catch (e) { console.error('Attendance Discord delivery pending:', e.message); }
    res.status(saved.duplicate ? 200 : 201).json({ record: saved.record, notificationPending });
  });
  let retrying = false;
  const retryPending = async () => {
    if (retrying) return; retrying = true;
    try { for (const job of db.prepare('SELECT reference FROM attendance_delivery WHERE sent=0 LIMIT 10').all()) await deliver(job.reference).catch(e => console.error('Attendance Discord retry:', e.message)); }
    finally { retrying = false; }
  };
  const retry = setInterval(retryPending, 60000); retry.unref();
  return { retryPending, close: () => clearInterval(retry) };
}
module.exports = { validate, createSqliteStorage, registerAttendance, POLICY, label };
