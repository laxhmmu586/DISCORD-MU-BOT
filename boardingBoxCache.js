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
    this.select = db.prepare('SELECT payload,updated_at FROM boarding_box_cache WHERE flight_no=? AND flight_date=?');
    this.touch = db.prepare('UPDATE boarding_box_cache SET updated_at=? WHERE flight_date=? AND source_hash=?');
    this.upsert = db.prepare(`INSERT INTO boarding_box_cache VALUES (?,?,?,?,?)
      ON CONFLICT(flight_date,flight_no) DO UPDATE SET payload=excluded.payload,source_hash=excluded.source_hash,updated_at=excluded.updated_at`);
    this.sequence = 0; this.applied = 0; this.generation = 0;
    this.write = db.transaction((rows, date, hash) => {
      for (const row of rows) this.upsert.run(date, row.flightNo, JSON.stringify(row), hash, this.now());
    });
  }
  beginUpdate() { return { sequence:++this.sequence, generation:this.generation, date:operationalDate(new Date(this.now())) }; }
  invalidate() { this.generation++; this.lastHash = null; }
  updateFromLog(log, ticket = this.beginUpdate()) {
    this.beforeAccess();
    const date = operationalDate(new Date(this.now()));
    if (!log || ticket.date !== date || ticket.generation !== this.generation || ticket.sequence < this.applied) return;
    const hash = createHash('sha256').update(log).digest('hex');
    if (this.lastHash === hash && this.lastDate === date) {
      this.touch.run(this.now(), date, hash); this.applied = ticket.sequence; return;
    }
    const rows = SUPPORTED_FLIGHTS.map(flight => findBoardingBoxInfo(scopedLog(log, flight, date), flight, date)).filter(Boolean);
    // A temporarily incomplete/failed download must not destroy a persisted snapshot.
    if (!rows.length) return;
    this.write(rows, date, hash); this.applied = ticket.sequence; this.lastHash = hash; this.lastDate = date;
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
    if (row) {
      if (this.now() - row.updated_at >= this.interval) this.refresh().catch(error => this.report('BOX refresh:', error.message));
      return { ...JSON.parse(row.payload), cached:true, updatedAt:row.updated_at };
    }
    await this.refresh();
    this.beforeAccess();
    if (date !== operationalDate(new Date(this.now()))) return null;
    row = this.select.get(flight, date);
    return row ? { ...JSON.parse(row.payload), cached:true, updatedAt:row.updated_at } : null;
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
