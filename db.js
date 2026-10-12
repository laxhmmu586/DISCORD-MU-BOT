const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'boarding.db');
const db = new Database(dbPath, { timeout: 3000 });

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 3000');

db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_date TEXT NOT NULL,
    flight_no TEXT NOT NULL,
    boarding_no TEXT NOT NULL,
    scan_time TEXT NOT NULL,
    device_id TEXT,
    synced INTEGER DEFAULT 0
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_scan
  ON scans(flight_date, flight_no, boarding_no);
`);

console.log('SQLite database ready:', dbPath);
module.exports = db;
