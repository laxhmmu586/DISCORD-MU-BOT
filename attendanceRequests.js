const crypto = require('node:crypto');
const { google } = require('googleapis');
const SPREADSHEET_ID = '12tZLWvQin1bhbWvALdnlAxkR0iD_6ScUVWEnL6IziDY';
const SHEET_ID = 580541604;
const HEADERS = ['Timestamp', 'Name', 'Call Type', 'Which day do you want to call off / report sick?', 'Why you need call off/sick', 'When will you be at the office?', 'Why?', 'Reference', 'Employee ID', 'Request Date', 'Scheduled Start', 'Note'];
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
const normalizeHeader = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const columnName = n => { let s = ''; for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
function createSheetsStorage({ sheets, spreadsheetId = SPREADSHEET_ID, sheetId = SHEET_ID } = {}) {
  if (!sheets) {
    const auth = new google.auth.GoogleAuth({ credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    sheets = google.sheets({ version: 'v4', auth });
  }
  let tail = Promise.resolve();
  const serial = fn => { const result = tail.then(fn); tail = result.catch(() => {}); return result; };
  async function read() {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
    const tab = meta.data.sheets.find(s => s.properties.sheetId === sheetId);
    if (!tab) throw new Error('The attendance worksheet was not found');
    const title = "'" + tab.properties.title.replaceAll("'", "''") + "'";
    const columnCount = tab.properties.gridProperties?.columnCount || 26;
    const values = (await sheets.spreadsheets.values.get({ spreadsheetId, range: title + '!A:' + columnName(Math.min(columnCount, 52) - 1) })).data.values || [];
    const headers = [...(values[0] || [])];
    // Preserve the original Google Form response columns, including unknown columns.
    for (const name of HEADERS) if (!headers.some(h => normalizeHeader(h) === normalizeHeader(name))) headers.push(name);
    if (headers.length > 52) throw new Error('The attendance worksheet has too many columns');
    if (headers.length > columnCount) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ appendDimension: { sheetId, dimension: 'COLUMNS', length: headers.length - columnCount } }] } });
    if (JSON.stringify(headers) !== JSON.stringify(values[0] || [])) await sheets.spreadsheets.values.update({ spreadsheetId, range: title + '!A1:' + columnName(headers.length - 1) + '1', valueInputOption: 'RAW', requestBody: { values: [headers] } });
    return { title, headers, rows: values.slice(1), index: name => headers.findIndex(h => normalizeHeader(h) === normalizeHeader(name)) };
  }
  return { save: record => serial(async () => {
    const data = await read();
    const prior = data.rows.find(row => String(row[data.index('Reference')] || '').endsWith(record.id.toUpperCase()));
    if (prior) {
      const original = { ...record, reference: prior[data.index('Reference')], employeeId: prior[data.index('Employee ID')], employeeName: prior[data.index('Name')], type: prior[data.index('Call Type')] === 'COMING LATE' ? 'late' : 'sick', date: prior[data.index('Request Date')], arrivalTime: prior[data.index('When will you be at the office?')] || '', scheduledStart: prior[data.index('Scheduled Start')] || '', reason: prior[data.index('Why?')] || prior[data.index('Why you need call off/sick')] || '', note: prior[data.index('Note')] || '', submittedAt: prior[data.index('Timestamp')] };
      if (['employeeId','type','date','arrivalTime','scheduledStart','reason','note'].some(k => original[k] !== record[k])) { const e = new Error('This reference was already used for another request. Start a new request.'); e.status = 409; throw e; }
      return { record: original, duplicate: true, history: history(data, original) };
    }
    const values = { Timestamp: record.submittedAt, Name: record.employeeName, 'Call Type': record.type === 'late' ? 'COMING LATE' : 'CALL OFF/SICK', 'Which day do you want to call off / report sick?': record.type === 'sick' ? record.date : '', 'Why you need call off/sick': record.type === 'sick' ? record.reason : '', 'When will you be at the office?': record.arrivalTime, 'Why?': record.type === 'late' ? record.reason : '', Reference: record.reference, 'Employee ID': record.employeeId, 'Request Date': record.date, 'Scheduled Start': record.scheduledStart, Note: record.note };
    const row = data.headers.map(h => values[HEADERS.find(n => normalizeHeader(n) === normalizeHeader(h))] ?? '');
    await sheets.spreadsheets.values.append({ spreadsheetId, range: data.title + '!A:' + columnName(data.headers.length - 1), valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] } });
    data.rows.push(row);
    return { record, duplicate: false, history: history(data, record) };
  }) };
}
function history(data, record) {
  return data.rows.filter(row => row[data.index('Employee ID')] === record.employeeId && String(row[data.index('Request Date')]).startsWith(record.date.slice(0, 7))).map(row => ({ date: row[data.index('Request Date')], type: row[data.index('Call Type')] === 'COMING LATE' ? 'late' : 'sick' })).sort((a,b) => a.date.localeCompare(b.date));
}
function registerAttendance(app, { employees, client, db, storage = createSheetsStorage(), renderCards = (...args) => require('./attendanceCards').renderCards(...args), channelId = process.env.ATTENDANCE_DISCORD_CHANNEL_ID || '1365021189998903418', now = () => new Date() }) {
  db.exec('CREATE TABLE IF NOT EXISTS attendance_delivery (reference TEXT PRIMARY KEY, data TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0)');
  const active = new Map();
  async function deliver(reference) {
    if (active.has(reference)) return active.get(reference);
    const work = (async () => {
      const job = db.prepare('SELECT * FROM attendance_delivery WHERE reference=?').get(reference);
      if (!job || job.sent) return;
      const { record, history } = JSON.parse(job.data);
      let stage = 'channel lookup';
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || typeof channel.send !== 'function') throw new Error('The configured channel cannot receive messages');
        let media;
        stage = 'image rendering';
        try { media = { files: await renderCards(record, history) }; }
        catch (error) {
          console.error('Attendance Discord image fallback:', { reference, channelId, error: error.message });
          media = { embeds: require('./attendanceDiscord').fallbackEmbeds(record, history) };
        }
        stage = 'message send';
        const message = await channel.send({ content: `${label(record)} · ${record.employeeName} · ${record.reference}`, ...media, allowedMentions: { parse: [] }, nonce: crypto.createHash('sha256').update(reference).digest('hex').slice(0,24), enforceNonce: true });
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
  app.get('/attendance-api/employees', (_req, res) => { res.set('Cache-Control', 'no-store').json({ employees: employees.get().employees.filter(e => e.name).map(({ id, name }) => ({ id, name })) }); });
  app.post('/attendance-api/requests', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let saved;
    try {
      const record = { ...validate(req.body, employees), submittedAt: now().toISOString() };
      saved = await storage.save(record);
    } catch (e) {
      if (!e.status) console.error('Attendance Sheets save failed:', e.message);
      return res.status(e.status || 503).json({ error: e.status ? e.message : 'Could not save your request to Google Sheets. Please retry with this page open.' });
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
module.exports = { validate, createSheetsStorage, registerAttendance, HEADERS, POLICY, label };
