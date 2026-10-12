'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// FULL synchronous commits acknowledge scans only after durable storage. The
// separate exclusive lease is released by SQLite/OS locks after a crash, even
// when a restarted container has a different hostname or reuses the same PID.
class BoardingLiveStore {
  constructor(directory) {
    if (!path.isAbsolute(directory)) throw new Error('BOARDING_LIVE_STORE_DIR must be an absolute persistent directory.');
    this.directory = directory;
    this.ready = null;
  }
  async acquire() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const { DatabaseSync } = require('node:sqlite');
    try {
      this.lease = new DatabaseSync(path.join(this.directory, 'writer.sqlite'));
      this.lease.exec('PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;');
    } catch (error) {
      this.lease?.close(); this.lease = null;
      throw new Error('Boarding live store already has an active writer or cannot be locked.', { cause: error });
    }
    this.database = new DatabaseSync(path.join(this.directory, 'state.sqlite'));
    this.database.exec(`PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS boarding_state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);`);
  }
  async load() {
    if (!this.ready) this.ready = this.acquire();
    await this.ready;
    const row = this.database.prepare('SELECT json FROM boarding_state WHERE id = 1').get();
    if (!row) return { schema: 1, revision: 0, flights: {} };
    const value = JSON.parse(row.json);
    if (value.schema !== 1 || !value.flights || typeof value.flights !== 'object') throw new Error('Invalid boarding live state.');
    return value;
  }
  async save(value) {
    this.database.prepare('INSERT INTO boarding_state (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json')
      .run(JSON.stringify(value));
  }
  async close() {
    this.database?.close(); this.database = null;
    this.lease?.close(); this.lease = null;
  }
}
module.exports = { BoardingLiveStore };
