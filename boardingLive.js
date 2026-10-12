'use strict';
const { normalizeBoardingFlight } = require('./boardingContext');

const NBRD_INTERVAL_MS = 3000;
const BACKUP_INTERVAL_MS = 6000;
const NBRD_MAX_AGE_MS = 15000;
const bnKey = value => String(value || '').replace(/\D/g, '').padStart(4, '0');
const displayBn = value => bnKey(value).slice(-3);
function failure(code, message, extra = {}) { return Object.assign(new Error(message), { code, ...extra }); }

class BoardingLive {
  constructor({ store, sheets, now = Date.now, timers = globalThis, report = console.error }) {
    Object.assign(this, { store, sheets, now, timers, report });
    this.state = null;
    this.tail = Promise.resolve();
    this.initializing = new Map();
    this.clients = new Map();
    this.nbrdReadAt = new Map();
    this.ready = null;
    this.backupRunning = null;
    this.pollRunning = null;
    this.stopped = false;
  }
  serial(fn) {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => {});
    return result;
  }
  async start() {
    if (!this.ready) this.ready = (async () => {
      this.state = await this.store.load();
      // On restart, refresh NBRD before accepting a scan; replay pending backups.
      this.schedule('pollTimer', () => this.poll(), NBRD_INTERVAL_MS);
      this.schedule('backupTimer', () => this.backup(), BACKUP_INTERVAL_MS);
    })();
    return this.ready;
  }
  schedule(key, fn, delay) {
    this[key] = this.timers.setTimeout(async () => {
      try { await fn(); } catch (error) { this.report('Boarding live background task:', error.message); }
      finally { if (!this.stopped) this.schedule(key, fn, delay); }
    }, delay);
    this[key]?.unref?.();
  }
  async commit(change, flights = []) {
    return this.serial(async () => {
      const next = structuredClone(this.state);
      next.revision++;
      const result = change(next);
      await this.store.save(next);
      this.state = next;
      for (const flight of flights) this.publish(flight);
      return result;
    });
  }
  async ensure(flight) {
    if (!normalizeBoardingFlight(flight)) throw failure('WRONG_FLIGHT', 'Choose MU586, MU9586 or MU578.');
    await this.start();
    if (!this.initializing.has(flight) && (!this.state.flights[flight] || !this.nbrdReadAt.has(flight))) {
      const pending = (async () => {
        if (!this.state.flights[flight]) {
          const initial = await this.sheets.seed(flight);
          await this.commit(next => {
            next.flights[flight] = { title: initial.title, rows: initial.rows, nbrd: initial.nbrd, dirty: {} };
          }, [flight]);
          this.nbrdReadAt.set(flight, this.now());
        } else {
          await this.poll();
        }
      })().finally(() => this.initializing.delete(flight));
      this.initializing.set(flight, pending);
    }
    await this.initializing.get(flight);
  }
  snapshot(flight) {
    const board = this.state.flights[flight];
    const rows = board.rows.map(row => {
      const { values, infantValues, ...visible } = row;
      return visible;
    });
    for (const item of board.nbrd) {
      let row = rows.find(row => row.rowNumber === item.rowNumber);
      if (!row) { row = { rowNumber: item.rowNumber }; rows.push(row); }
      row.nbrdBn = item.bn; row.nbrdDetail = item.detail;
    }
    return { ok: true, live: true, flightNo: flight, revision: this.state.revision, rows,
      nbrd: board.nbrd, nbrdUpdatedAt: this.nbrdReadAt.get(flight) || null,
      nbrdFresh: this.now() - (this.nbrdReadAt.get(flight) ?? -Infinity) <= NBRD_MAX_AGE_MS,
      backupPending: Object.keys(board.dirty).length > 0 };
  }
  async records(flight) { await this.ensure(flight); return this.snapshot(flight); }
  subscribe(flight, callback) {
    if (!this.clients.has(flight)) this.clients.set(flight, new Set());
    this.clients.get(flight).add(callback);
    return () => this.clients.get(flight)?.delete(callback);
  }
  publish(flight) {
    for (const callback of this.clients.get(flight) || []) {
      try { callback(this.snapshot(flight)); } catch (error) { this.report('Boarding SSE client:', error.message); }
    }
  }
  async scan(flight, record) {
    await this.ensure(flight);
    if (normalizeBoardingFlight(record.flight) !== flight) throw failure('WRONG_FLIGHT', `This boarding pass does not belong to ${flight}.`);
    return this.commit(next => {
      if (this.now() - (this.nbrdReadAt.get(flight) ?? -Infinity) > NBRD_MAX_AGE_MS) {
        throw failure('NBRD_UNAVAILABLE', 'NBRD updates are unavailable. Please wait for the connection to recover.');
      }
      const board = next.flights[flight];
      const bn = bnKey(record.bn);
      if (!String(record.bn || '').replace(/\D/g, '') || !/^\d{4}$/.test(bn)) throw failure('SCAN_ERROR', 'Invalid BN.');
      const blocked = board.nbrd.find(item => bnKey(item.bn) === bn);
      if (blocked) throw failure('NBRD_MESSAGE', `NBRD message: ${blocked.detail}`, { bn: displayBn(bn), detail: blocked.detail });
      const infant = record.isInfant === true || record.seat === 'INF';
      const field = infant ? 'infantBn' : 'bn';
      if (board.rows.some(row => row[field] && bnKey(row[field]) === bn)) throw failure('DUPLICATE_BN', `Duplicate BN ${displayBn(bn)}.`, { bn: displayBn(bn) });
      const rowNumber = Math.max(1, ...board.rows.filter(row => row[field]).map(row => row.rowNumber)) + 1;
      let row = board.rows.find(row => row.rowNumber === rowNumber);
      if (!row) { row = { rowNumber, entered: false }; board.rows.push(row); }
      const seat = String(record.seat || '').trim().toUpperCase();
      const scannedAt = record.scannedAt || new Date(this.now()).toISOString();
      const values = [displayBn(bn), seat, String(record.flight).toUpperCase(), record.rawScan || record.raw || '', scannedAt];
      Object.assign(row, infant
        ? { infantBn: values[0], infantSeat: seat, infantFlight: values[2], infantScannedAt: scannedAt, infantValues: values }
        : { bn: values[0], seat, flight: values[2], scannedAt, values });
      board.dirty[`${infant ? 'infant' : 'scan'}:${rowNumber}`] = next.revision;
      if (!infant) {
        row.entered = false;
        board.dirty[`entered:${rowNumber}`] = next.revision;
      }
      return { bn: values[0], seat, flight: values[2], scannedAt, rowNumber, isInfant: infant, backupPending: true };
    }, [flight]);
  }
  async entered(flight, rowNumbers, entered) {
    await this.ensure(flight);
    const numbers = [...new Set((Array.isArray(rowNumbers) ? rowNumbers : [rowNumbers]).map(Number))];
    if (!numbers.length || numbers.some(number => !this.state.flights[flight].rows.some(row => row.rowNumber === number && row.bn))) throw failure('INVALID_ROW', 'No valid scan row numbers.');
    return this.commit(next => {
      const board = next.flights[flight];
      for (const number of numbers) {
        board.rows.find(row => row.rowNumber === number).entered = Boolean(entered);
        board.dirty[`entered:${number}`] = next.revision;
      }
      return { rowNumbers: numbers, entered: Boolean(entered) };
    }, [flight]);
  }
  async poll() {
    if (this.pollRunning) return this.pollRunning;
    this.pollRunning = (async () => {
      const flights = Object.keys(this.state.flights);
      if (!flights.length) return;
      const nbrd = await this.sheets.readNbrd(flights.map(flight => ({ flight, title: this.state.flights[flight].title })));
      const changed = flights.filter(flight => JSON.stringify(this.state.flights[flight].nbrd) !== JSON.stringify(nbrd[flight]));
      if (changed.length) await this.commit(next => {
        for (const flight of changed) next.flights[flight].nbrd = nbrd[flight];
      });
      const recovered = flights.filter(flight => this.now() - (this.nbrdReadAt.get(flight) ?? -Infinity) > NBRD_MAX_AGE_MS);
      for (const flight of flights) this.nbrdReadAt.set(flight, this.now());
      for (const flight of new Set([...changed, ...recovered])) this.publish(flight);
    })().catch(error => {
      for (const flight of Object.keys(this.state.flights)) {
        if (!this.snapshot(flight).nbrdFresh) this.publish(flight);
      }
      throw error;
    }).finally(() => { this.pollRunning = null; });
    return this.pollRunning;
  }
  async backup() {
    if (this.backupRunning) return this.backupRunning;
    this.backupRunning = (async () => {
      const batch = Object.entries(this.state.flights).filter(([, board]) => Object.keys(board.dirty).length)
        .map(([flight, board]) => ({ flight, ...structuredClone(board) }));
      if (!batch.length) return;
      await this.sheets.backup(batch);
      await this.commit(next => {
        for (const board of batch) for (const [key, version] of Object.entries(board.dirty)) {
          if (next.flights[board.flight].dirty[key] === version) delete next.flights[board.flight].dirty[key];
        }
      }, batch.map(board => board.flight));
    })().finally(() => { this.backupRunning = null; });
    return this.backupRunning;
  }
  async close() {
    this.stopped = true;
    this.timers.clearTimeout(this.pollTimer); this.timers.clearTimeout(this.backupTimer);
    await Promise.allSettled([this.pollRunning, this.backupRunning, this.tail]);
    await this.store.close?.();
  }
}
module.exports = { BoardingLive, NBRD_INTERVAL_MS, BACKUP_INTERVAL_MS, NBRD_MAX_AGE_MS };
