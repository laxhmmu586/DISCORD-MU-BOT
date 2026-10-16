'use strict';
const { normalizeBoardingFlight } = require('./boardingContext');
const { operationalDate } = require('./flightContext');
const { nextBoardingCleanup } = require('./boardingCleanupTime');
const canonicalBn = value => String(Number(String(value || '').replace(/\D/g, ''))).padStart(3, '0');
const failure = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

class BoardingSqliteLive {
  constructor({ db, now = Date.now, report = console.error, timers = globalThis, onReset = () => {} }) {
    Object.assign(this, { db, now, report, timers, onReset });
    // Companion tables preserve the UI fields and NBRD without changing scans.
    db.exec(`CREATE TABLE IF NOT EXISTS boarding_scan_details (
      scan_id INTEGER PRIMARY KEY REFERENCES scans(id), seat TEXT NOT NULL DEFAULT '',
      raw_scan TEXT NOT NULL DEFAULT '', is_infant INTEGER NOT NULL DEFAULT 0,
      entered INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS boarding_nbrd (
      id INTEGER PRIMARY KEY AUTOINCREMENT, flight_date TEXT NOT NULL,
      flight_no TEXT NOT NULL, boarding_no TEXT NOT NULL, detail TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0, UNIQUE(flight_date,flight_no,boarding_no)
    );
    CREATE TABLE IF NOT EXISTS boarding_nbrd_versions (
      flight_date TEXT NOT NULL, flight_no TEXT NOT NULL, version INTEGER NOT NULL,
      PRIMARY KEY(flight_date,flight_no)
    );
    CREATE TABLE IF NOT EXISTS boarding_maintenance (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS boarding_box_cache (
      flight_date TEXT NOT NULL, flight_no TEXT NOT NULL, payload TEXT NOT NULL,
      source_hash TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(flight_date,flight_no)
    );
    CREATE TABLE IF NOT EXISTS boarding_scan_requests (
      request_id TEXT PRIMARY KEY, scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE
    );`);
    this.findRequest = db.prepare(`SELECT s.*, d.raw_scan, d.seat, d.is_infant
      FROM boarding_scan_requests r JOIN scans s ON s.id=r.scan_id
      JOIN boarding_scan_details d ON d.scan_id=s.id WHERE r.request_id=?`);
    this.insertRequest = db.prepare('INSERT INTO boarding_scan_requests (request_id,scan_id) VALUES (?,?)');
    this.insertScan = db.prepare('INSERT INTO scans (flight_date,flight_no,boarding_no,scan_time,device_id,synced) VALUES (?,?,?,?,?,0)');
    this.insertDetails = db.prepare('INSERT INTO boarding_scan_details (scan_id,seat,raw_scan,is_infant,entered) VALUES (?,?,?,?,0)');
    this.selectRows = db.prepare(`SELECT s.*, d.seat, d.is_infant, d.entered
      FROM scans s LEFT JOIN boarding_scan_details d ON d.scan_id=s.id
      WHERE s.flight_no=? AND s.flight_date=? ORDER BY s.id`);
    this.selectNbrd = db.prepare('SELECT * FROM boarding_nbrd WHERE flight_no=? AND flight_date=? ORDER BY id');
    this.findNbrd = db.prepare('SELECT * FROM boarding_nbrd WHERE flight_no=? AND flight_date=? AND boarding_no=?');
    this.resolveNbrd = db.prepare('UPDATE boarding_nbrd SET resolved=? WHERE flight_no=? AND flight_date=? AND boarding_no=?');
    this.updateEntered = db.prepare(`INSERT INTO boarding_scan_details (scan_id,entered) VALUES (?,?)
      ON CONFLICT(scan_id) DO UPDATE SET entered=excluded.entered`);
    this.upsertNbrd = db.prepare(`INSERT INTO boarding_nbrd (flight_date,flight_no,boarding_no,detail,resolved)
      VALUES (?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM scans WHERE flight_date=? AND flight_no=? AND boarding_no=?) THEN 1 ELSE 0 END)
      ON CONFLICT(flight_date,flight_no,boarding_no) DO UPDATE SET detail=excluded.detail
      WHERE boarding_nbrd.detail<>excluded.detail`);
    this.getVersion = db.prepare('SELECT version FROM boarding_nbrd_versions WHERE flight_no=? AND flight_date=?');
    this.setVersion = db.prepare(`INSERT INTO boarding_nbrd_versions (flight_date,flight_no,version) VALUES (?,?,?)
      ON CONFLICT(flight_date,flight_no) DO UPDATE SET version=excluded.version`);
    this.add = db.transaction((flight, date, record, blocked) => {
      const result = this.insertScan.run(date, flight, (record.isInfant ? 'INF' : '') + canonicalBn(record.bn), record.scannedAt, record.deviceId || null);
      const id = Number(result.lastInsertRowid);
      this.insertDetails.run(id, record.seat || '', record.rawScan || record.raw || '', record.isInfant ? 1 : 0);
      if (record.requestId) this.insertRequest.run(record.requestId, id);
      if (blocked) this.resolveNbrd.run(1, flight, date, canonicalBn(record.bn));
      return id;
    });
    this.boards = new Map(); this.clients = new Map(); this.revision = now();
    this.saveCleanupAt = db.prepare(`INSERT INTO boarding_maintenance (key,value) VALUES ('last_cleanup_at',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
    const previous = db.prepare("SELECT value FROM boarding_maintenance WHERE key='last_cleanup_at'").get();
    if (!previous) this.saveCleanupAt.run(now());
    this.nextCleanupAt = nextBoardingCleanup(previous?.value ?? now());
    this.clearData = db.transaction(() => {
      db.exec('DELETE FROM boarding_scan_details; DELETE FROM scans; DELETE FROM boarding_nbrd; DELETE FROM boarding_nbrd_versions; DELETE FROM boarding_box_cache;');
      this.saveCleanupAt.run(this.now());
    });
    this.cleanupIfDue();
  }
  key(flight, date) { return `${flight}/${date}`; }
  ensure(flight, date = operationalDate(new Date(this.now()))) {
    this.cleanupIfDue();
    const key = this.key(flight, date);
    if (!this.boards.has(key)) this.boards.set(key, this.selectRows.all(flight, date));
    return this.boards.get(key);
  }
  nbrdRecords(flight, date = operationalDate(new Date(this.now()))) {
    this.cleanupIfDue();
    return this.selectNbrd.all(flight, date).map(row => ({ rowNumber: row.id, nbrdBn: row.boarding_no,
      nbrdDetail: row.detail, nbrdResolved: Boolean(row.resolved) }));
  }
  snapshot(flight, date = operationalDate(new Date(this.now()))) {
    const rows = this.ensure(flight, date).map(row => ({ rowNumber: row.id, entered: Boolean(row.entered),
      ...(row.is_infant ? { infantBn: row.boarding_no.replace(/^INF/, ''), infantSeat: row.seat || 'INF', infantFlight: row.flight_no, infantScannedAt: row.scan_time }
        : { bn: row.boarding_no, seat: row.seat || '', flight: row.flight_no, scannedAt: row.scan_time }) }));
    const nbrdRows = this.nbrdRecords(flight, date); rows.push(...nbrdRows);
    return { ok: true, live: true, storage: 'sqlite', flightNo: flight, flightDate: date, revision: this.revision,
      rows, nbrd: nbrdRows.filter(row => !row.nbrdResolved).map(row => ({ rowNumber: row.rowNumber, bn: row.nbrdBn, detail: row.nbrdDetail })),
      nbrdFresh: true, backupPending: false };
  }
  records(flight, date) { return this.snapshot(flight, date); }
  subscribe(flight, callback, date = operationalDate(new Date(this.now()))) {
    const key = this.key(flight, date);
    if (!this.clients.has(key)) this.clients.set(key, new Set());
    this.clients.get(key).add(callback); return () => this.clients.get(key)?.delete(callback);
  }
  publish(flight, date) {
    try {
      const snapshot = this.snapshot(flight, date);
      for (const callback of this.clients.get(this.key(flight, date)) || []) {
        try { callback(snapshot); } catch (err) { this.report('Boarding SSE client:', err.message); }
      }
    } catch (err) { this.report('Boarding SSE snapshot:', err.message); }
  }
  scan(flight, record, date = operationalDate(new Date(this.now()))) {
    this.cleanupIfDue();
    if (normalizeBoardingFlight(record.flight) !== flight) throw failure('WRONG_FLIGHT', `This boarding pass does not belong to ${flight}.`);
    if (!/^\d{1,4}$/.test(String(record.bn || ''))) throw failure('SCAN_ERROR', 'Invalid BN.');
    if (record.requestId !== undefined && (typeof record.requestId !== 'string' || !/^[A-Za-z0-9-]{16,80}$/.test(record.requestId))) throw failure('SCAN_ERROR', 'Invalid scan request ID.');
    if (record.requestId) {
      const previous = this.findRequest.get(record.requestId);
      if (previous) {
        if (previous.flight_no !== flight || previous.flight_date !== date || previous.raw_scan !== (record.rawScan || record.raw || '')) {
          throw failure('SCAN_ERROR', 'Scan request ID belongs to another boarding pass.');
        }
        return { bn: previous.boarding_no.replace(/^INF/, ''), seat: previous.seat, flight,
          rowNumber: previous.id, scannedAt: previous.scan_time, isInfant: Boolean(previous.is_infant),
          backupPending: false, replayed: true, nbrdRows: this.nbrdRecords(flight, date) };
      }
    }
    // This SELECT checks NBRD only. The scan INSERT's UNIQUE constraint is the
    // sole duplicate check; no Sheets or other network call runs here.
    const blocked = this.findNbrd.get(flight, date, canonicalBn(record.bn));
    if (blocked && !blocked.resolved && (!record.nbrdConfirmed || record.nbrdConfirmationDetail !== blocked.detail)) {
      throw failure('NBRD_MESSAGE', `NBRD message: ${blocked.detail}`, { bn: canonicalBn(record.bn), detail: blocked.detail });
    }
    const scannedAt = new Date(this.now()).toISOString();
    const isInfant = record.isInfant === true || record.seat === 'INF';
    // Prepare response details before the commit so an enrichment failure can
    // never turn an acknowledged INSERT into an API error.
    const nbrdRows = this.nbrdRecords(flight, date);
    let id;
    try { id = this.add(flight, date, { ...record, scannedAt, isInfant }, blocked && !blocked.resolved); }
    catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw failure('DUPLICATE_BN', `Duplicate BN ${canonicalBn(record.bn)}.`, { bn: canonicalBn(record.bn) });
      throw err;
    }
    const rows = this.boards.get(this.key(flight, date));
    if (rows) rows.push({ id, flight_no: flight, boarding_no: (isInfant ? 'INF' : '') + canonicalBn(record.bn), scan_time: scannedAt,
      seat: record.seat || '', is_infant: isInfant, entered: 0 });
    this.revision++; this.publish(flight, date);
    if (blocked && !blocked.resolved) for (const row of nbrdRows) if (row.nbrdBn === canonicalBn(record.bn)) row.nbrdResolved = true;
    return { bn: canonicalBn(record.bn), seat: record.seat || '', flight, rowNumber: id, scannedAt, isInfant,
      backupPending: false, nbrdRows };
  }
  entered(flight, numbers, entered, date = operationalDate(new Date(this.now()))) {
    const rows = this.ensure(flight, date), ids = [...new Set(numbers.map(Number))];
    if (!ids.length || ids.some(id => !rows.some(row => row.id === id && !row.is_infant))) throw failure('INVALID_ROW', 'No valid scan row numbers.');
    this.db.transaction(() => { for (const id of ids) this.updateEntered.run(id, entered ? 1 : 0); })();
    for (const row of rows) if (ids.includes(row.id)) row.entered = entered ? 1 : 0;
    this.revision++; this.publish(flight, date);
    return { rowNumbers: ids, entered: Boolean(entered) };
  }
  saveNbrd(flight, entries, options = {}, date = operationalDate(new Date(this.now()))) {
    this.cleanupIfDue();
    const normalized = entries.map(item => typeof item === 'object' && item ? item : { bn: item, detail: '' });
    if (normalized.some(item => !/^\d{1,4}$/.test(String(item.bn || '').replace(/\D/g, '')))) throw failure('INVALID_BN', 'BN must be 1 to 4 digits.');
    const result = this.db.transaction(() => {
      const current = this.getVersion.get(flight, date)?.version || 0, version = Number(options.version) || 0;
      if (version && version < current) return { stale: true };
      let changes = 0;
      for (const item of normalized) changes += this.upsertNbrd.run(date, flight, canonicalBn(item.bn), String(item.detail || item.message || item.info || '').trim(), date, flight, canonicalBn(item.bn)).changes;
      if (version) this.setVersion.run(date, flight, version);
      return { added: normalized.map(item => canonicalBn(item.bn)), changed: changes > 0 };
    })();
    if (result.changed) { this.revision++; this.publish(flight, date); } return result;
  }
  resolve(flight, bn, resolved, date = operationalDate(new Date(this.now()))) {
    this.cleanupIfDue();
    const result = this.resolveNbrd.run(resolved ? 1 : 0, flight, date, canonicalBn(bn));
    if (!result.changes) throw failure('NBRD_NOT_FOUND', 'NBRD not found.');
    this.revision++; this.publish(flight, date); return { bn: canonicalBn(bn), resolved: Boolean(resolved) };
  }
  removeNbrd(flight, id, bn, date = operationalDate(new Date(this.now()))) {
    this.cleanupIfDue();
    const row = this.selectNbrd.all(flight, date).find(item => item.id === Number(id));
    if (!row) throw failure('NBRD_NOT_FOUND', 'NBRD not found.');
    if (bn && row.boarding_no !== canonicalBn(bn)) throw failure('NBRD_MISMATCH', 'NBRD row changed.');
    // Preserve the existing delete action as resolution in both board views.
    return this.resolve(flight, row.boarding_no, true, date);
  }
  resetFlight(flight, date = operationalDate(new Date(this.now()))) {
    this.cleanupIfDue();
    const cleared = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM boarding_scan_details WHERE scan_id IN
        (SELECT id FROM scans WHERE flight_no=? AND flight_date=?)`).run(flight, date);
      const scans = this.db.prepare('DELETE FROM scans WHERE flight_no=? AND flight_date=?').run(flight, date).changes;
      const nbrd = this.db.prepare('DELETE FROM boarding_nbrd WHERE flight_no=? AND flight_date=?').run(flight, date).changes;
      this.db.prepare('DELETE FROM boarding_nbrd_versions WHERE flight_no=? AND flight_date=?').run(flight, date);
      return { scans, nbrd };
    })();
    this.boards.delete(this.key(flight, date));
    this.revision++;
    this.onReset({ flight, date });
    this.publish(flight, date);
    return { flightNo: flight, flightDate: date, cleared };
  }
  cleanupIfDue() {
    if (this.now() < this.nextCleanupAt) return false;
    this.clearData();
    this.nextCleanupAt = nextBoardingCleanup(this.now());
    this.boards.clear();
    this.revision++;
    this.onReset();
    for (const key of this.clients.keys()) {
      const separator = key.indexOf('/');
      this.publish(key.slice(0, separator), key.slice(separator + 1));
    }
    return true;
  }
  startCleanup() {
    if (this.cleanupTimer) return;
    const schedule = () => {
      this.cleanupTimer = this.timers.setTimeout(() => {
        this.cleanupTimer = null;
        try { this.cleanupIfDue(); }
        catch (err) { this.report('Boarding 07:00 cleanup:', err.message); }
        schedule();
      }, this.nextCleanupAt > this.now() ? this.nextCleanupAt - this.now() : 5000);
      this.cleanupTimer?.unref?.();
    };
    schedule();
  }
  stopCleanup() { this.timers.clearTimeout(this.cleanupTimer); this.cleanupTimer = null; }
}
module.exports = { BoardingSqliteLive };
