'use strict';
const { createHash } = require('node:crypto');
const { SUPPORTED_FLIGHTS, scopedLog, operationalDate } = require('./flightContext');
const { findBoardingBoxInfo } = require('./syParser');

class BoardingBoxCache {
  constructor({ db, loadLog, beforeAccess = () => {}, now = Date.now, timers = globalThis, report = console.error, interval = 60000 }) {
    Object.assign(this, { db, loadLog, beforeAccess, now, timers, report, interval });
    db.exec(`CREATE TABLE IF NOT EXISTS boarding_box_cache (
      flight_date TEXT NOT NULL, flight_no TEXT NOT NULL, payload TEXT NOT NULL,
      source_hash TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(flight_date,flight_no)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS boarding_box_confirmations (
      flight_date TEXT NOT NULL, flight_no TEXT NOT NULL, box_id TEXT NOT NULL,
      PRIMARY KEY(flight_date,flight_no,box_id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS boarding_box_numbers (
      flight_date TEXT NOT NULL, flight_no TEXT NOT NULL, bn INTEGER NOT NULL, present INTEGER NOT NULL,
      PRIMARY KEY(flight_date,flight_no,bn)
    )`);
    this.numbers = db.prepare('SELECT bn,present FROM boarding_box_numbers WHERE flight_no=? AND flight_date=?');
    this.confirmed = db.prepare('SELECT box_id FROM boarding_box_confirmations WHERE flight_no=? AND flight_date=? ORDER BY box_id');
    this.select = db.prepare('SELECT payload,updated_at FROM boarding_box_cache WHERE flight_no=? AND flight_date=?');
    this.touch = db.prepare('UPDATE boarding_box_cache SET updated_at=? WHERE flight_date=? AND source_hash=?');
    this.upsert = db.prepare(`INSERT INTO boarding_box_cache VALUES (?,?,?,?,?)
      ON CONFLICT(flight_date,flight_no) DO UPDATE SET payload=excluded.payload,source_hash=excluded.source_hash,updated_at=excluded.updated_at`);
    this.sequence = 0; this.applied = 0; this.generation = 0;
    this.clients = new Map();
    this.revision = Math.max(now(), db.prepare('SELECT MAX(updated_at) AS value FROM boarding_box_cache').get().value || 0);
    this.write = db.transaction((rows, date, hash) => {
      const revision = this.nextRevision();
      for (const row of rows) this.upsert.run(date, row.flightNo, JSON.stringify(row), hash, revision);
    });
  }
  beginUpdate() { return { sequence:++this.sequence, generation:this.generation, date:operationalDate(new Date(this.now())) }; }
  nextRevision() { return this.revision = Math.max(this.now(), this.revision + 1); }
  snapshot(flight, date) {
    this.beforeAccess();
    const row = this.select.get(flight, date);
    if (!row) return null;
    const data = JSON.parse(row.payload);
    // Ignore persisted legacy FB snapshots until SY+BND have been loaded.
    if (data.source !== 'BND') return null;
    const bns = new Set(data.bns);
    for (const {bn,present} of this.numbers.all(flight,date)) {
      if (bn <= data.maxBn) { if (present) bns.add(bn); else bns.delete(bn); }
    }
    data.bns = [...bns].sort((a,b) => a-b);
    data.passengers = data.bns.length;
    data.total = data.infants == null ? null : data.passengers + data.infants;
    data.matched = data.expectedPassengers != null && data.expectedInfants != null
      && data.passengers === data.expectedPassengers && data.infants === data.expectedInfants;
    return { ...data, confirmedBoxes:this.confirmed.all(flight,date).map(item => item.box_id), cached:true, updatedAt:row.updated_at };
  }
  confirm(flight, date, boxId, confirmed) {
    this.beforeAccess();
    if (date !== operationalDate(new Date(this.now()))) throw Object.assign(new Error('Please select today’s flight.'),{status:400});
    const snapshot = this.snapshot(flight,date);
    if (!snapshot) throw Object.assign(new Error('BOX data unavailable. Please refresh.'),{status:404});
    const highest = snapshot.maxBn ?? Math.max(0,...snapshot.bns);
    const bn = Number(boxId);
    if (typeof confirmed !== 'boolean' || typeof boxId !== 'string'
      || (boxId !== 'INFANT' && (!/^[1-9]\d{0,2}$/.test(boxId) || (bn-1)%20 !== 0 || bn > highest))) {
      throw Object.assign(new Error('Invalid BOX selection.'),{status:422});
    }
    if (snapshot.confirmedBoxes.includes(boxId) === confirmed) return snapshot;
    this.db.transaction(() => {
      if (confirmed) this.db.prepare('INSERT OR IGNORE INTO boarding_box_confirmations VALUES (?,?,?)').run(date,flight,boxId);
      else this.db.prepare('DELETE FROM boarding_box_confirmations WHERE flight_date=? AND flight_no=? AND box_id=?').run(date,flight,boxId);
      this.db.prepare('UPDATE boarding_box_cache SET updated_at=? WHERE flight_date=? AND flight_no=?').run(this.nextRevision(),date,flight);
    })();
    const next = this.snapshot(flight,date); this.publish(flight,date,next); return next;
  }
  setNumber(flight, date, value, present) {
    this.beforeAccess();
    if (date !== operationalDate(new Date(this.now()))) throw Object.assign(new Error('Please select today’s flight.'),{status:400});
    const snapshot = this.snapshot(flight,date);
    if (!snapshot) throw Object.assign(new Error('BOX data unavailable. Please refresh.'),{status:404});
    const bn = Number(value);
    if (!['string','number'].includes(typeof value) || !/^[0-9]{1,4}$/.test(String(value))
      || !Number.isInteger(bn) || bn < 1 || bn > snapshot.maxBn || typeof present !== 'boolean') {
      throw Object.assign(new Error(`Enter a BN between 1 and ${snapshot.maxBn}.`),{status:422});
    }
    const previous = this.numbers.all(flight,date).find(row => row.bn === bn);
    if (previous?.present === Number(present)) return snapshot;
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO boarding_box_numbers VALUES (?,?,?,?)
        ON CONFLICT(flight_date,flight_no,bn) DO UPDATE SET present=excluded.present`).run(date,flight,bn,Number(present));
      this.db.prepare('UPDATE boarding_box_cache SET updated_at=? WHERE flight_date=? AND flight_no=?').run(this.nextRevision(),date,flight);
    })();
    const next = this.snapshot(flight,date); this.publish(flight,date,next); return next;
  }
  subscribe(flight, date, callback) {
    const key = `${flight}/${date}`;
    if (!this.clients.has(key)) this.clients.set(key, new Set());
    const clients = this.clients.get(key); clients.add(callback);
    return () => { clients.delete(callback); if (!clients.size) this.clients.delete(key); };
  }
  publish(flight, date, data) {
    for (const callback of this.clients.get(`${flight}/${date}`) || []) {
      try { callback(data); } catch (error) { this.report('BOX SSE client:', error.message); }
    }
  }
  invalidate() {
    this.generation++; this.lastHash = null;
    const updatedAt = this.nextRevision();
    for (const key of this.clients.keys()) {
      const [flightNo,flightDate] = key.split('/');
      this.publish(flightNo,flightDate,{reset:true,flightNo,flightDate,updatedAt});
    }
  }
  updateFromLog(log, ticket = this.beginUpdate()) {
    this.beforeAccess();
    const date = operationalDate(new Date(this.now()));
    if (!log || ticket.date !== date || ticket.generation !== this.generation || ticket.sequence < this.applied) return;
    const hash = createHash('sha256').update(log).digest('hex');
    if (this.lastHash === hash && this.lastDate === date) {
      this.touch.run(this.nextRevision(), date, hash); this.applied = ticket.sequence; return;
    }
    const rows = SUPPORTED_FLIGHTS.map(flight => findBoardingBoxInfo(scopedLog(log, flight, date), flight, date)).filter(Boolean);
    // A temporarily incomplete/failed download must not destroy a persisted snapshot.
    if (!rows.length) return;
    const changed = rows.filter(row => this.select.get(row.flightNo,date)?.payload !== JSON.stringify(row));
    this.write(rows, date, hash); this.applied = ticket.sequence; this.lastHash = hash; this.lastDate = date;
    for (const row of changed) this.publish(row.flightNo,date,this.snapshot(row.flightNo,date));
  }
  refresh() {
    if (this.pending) return this.pending;
    const ticket = this.beginUpdate();
    this.pending = Promise.resolve().then(() => this.loadLog()).then(log => {
      if (!log) throw new Error('Unable to load flight logs.');
      this.updateFromLog(log, ticket);
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async read(flight, date) {
    this.beforeAccess();
    if (date !== operationalDate(new Date(this.now()))) throw new Error('Please select today’s flight.');
    let row = this.select.get(flight, date);
    if (row && this.snapshot(flight,date)) {
      if (this.now() - row.updated_at >= this.interval) this.refresh().catch(error => this.report('BOX refresh:', error.message));
      return this.snapshot(flight,date);
    }
    await this.refresh();
    this.beforeAccess();
    if (date !== operationalDate(new Date(this.now()))) return null;
    row = this.select.get(flight, date);
    return row ? this.snapshot(flight,date) : null;
  }
  start() {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      try { await this.refresh(); } catch (error) { this.report('BOX preload:', error.message); }
      if (this.running) { this.timer = this.timers.setTimeout(tick, this.interval); this.timer?.unref?.(); }
    };
    void tick();
  }
  stop() { this.running = false; this.timers.clearTimeout(this.timer); }
}
module.exports = { BoardingBoxCache };
