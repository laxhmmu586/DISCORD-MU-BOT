const DEFAULT_NOTICE = [
 'Please let me know early in advance when you need to change weekly off days',
 'Please let me know **one month** in advance when you need to take vacation days off',
 '[Cross Account] If your attendance cannot be guaranteed, then your full schedule also cannot be guaranteed.'
].join('\n');

function createScheduleStandingNotice({app, db, handler, requireManager}) {
 db.exec('CREATE TABLE IF NOT EXISTS staff_schedule_standing_notice(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL, revision INTEGER NOT NULL, updated_by TEXT, updated_at TEXT)');
 db.prepare('INSERT OR IGNORE INTO staff_schedule_standing_notice(id,body,revision) VALUES(1,?,0)').run(DEFAULT_NOTICE);
 const read = () => db.prepare('SELECT body,revision,updated_at AS updatedAt FROM staff_schedule_standing_notice WHERE id=1').get();
 app.get('/staff-schedule-api/notice', handler(req => ({notice: read(), canEdit: req.scheduleAccess.canEdit && req.query.view !== 'self'})));
 app.post('/staff-schedule-api/notice', handler(req => {
  requireManager(req);
  const {body, revision} = req.body || {};
  if (typeof body !== 'string' || !body.trim() || body.length > 4000 || !Number.isSafeInteger(revision) || revision < 0) {
   throw Object.assign(Error('Enter a notice of 1–4,000 characters and a valid revision.'), {status: 400});
  }
  const saved = db.prepare('UPDATE staff_schedule_standing_notice SET body=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=1 AND revision=?')
   .run(body.trim(), req.scheduleAccess.employeeId, new Date().toISOString(), revision);
  if (!saved.changes) throw Object.assign(Error('Notice changed. Cancel and reopen the editor to load the latest version.'), {status: 409});
  return {notice: read()};
 }));
}
module.exports = {createScheduleStandingNotice, DEFAULT_NOTICE};
