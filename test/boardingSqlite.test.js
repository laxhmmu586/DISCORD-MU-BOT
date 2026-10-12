'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { BoardingSqliteLive } = require('../boardingSqliteLive');
const { nbrdEntriesFromFb } = require('../boardingNbrd');
const { createNbrdConfirmationStore } = require('../nbrdConfirmation');
const source = fs.readFileSync(require.resolve('../db'), 'utf8');
const schema = source.match(/db\.exec\(`([\s\S]*?)`\);/)[1];
const date = '11OCT26';
const record = (bn, extra = {}) => ({ flight: '0586', bn: String(bn), seat: '10A', rawScan: 'PRIVATE BARCODE', ...extra });
function harness(t, options = {}, config = {}) {
  const db = new Database(':memory:', options); db.exec(schema);
  const live = new BoardingSqliteLive({ db, report: () => {}, ...config });
  t.after(() => db.close()); return { db, live };
}

test('ten simultaneous scanners INSERT synchronously, persist every row, and broadcast before returning', async t => {
  const { db, live } = harness(t), events = [];
  live.subscribe('MU586', data => events.push(data), date);
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => Promise.resolve().then(() => {
    const result = live.scan('MU586', record(i + 1), date);
    assert.equal(result?.then, undefined, 'scan never waits on a promise or network operation');
    assert.equal(events.at(-1).rows.filter(row => row.bn).length, i + 1);
    return result;
  })));
  assert.equal(new Set(results.map(row => row.rowNumber)).size, 10);
  assert.equal(db.prepare('SELECT count(*) AS n FROM scans').get().n, 10);
  assert.ok(events.every(data => data.storage === 'sqlite' && !data.backupPending));
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE BARCODE/);
  assert.equal(typeof live.backup, 'undefined', 'Sheets backup is removed');
});

test('UNIQUE detects duplicates without SELECT-before-INSERT and normalizes leading zeros', t => {
  const sql = [], { db, live } = harness(t, { verbose: statement => sql.push(statement) });
  live.scan('MU586', record('14'), date); sql.length = 0;
  assert.throws(() => live.scan('MU586', record('0014'), date), { code: 'DUPLICATE_BN', bn: '014' });
  const insert = sql.findIndex(statement => /^INSERT INTO scans/.test(statement));
  assert.ok(insert >= 0);
  assert.ok(sql.slice(0, insert).every(statement => !/FROM scans/i.test(statement)), 'only NBRD is read before INSERT');
  assert.equal(db.prepare('SELECT count(*) AS n FROM scans').get().n, 1);
});

test('flight/date scopes and the existing infant namespace remain independent', t => {
  const { db, live } = harness(t);
  live.scan('MU586', record(14), date);
  live.scan('MU586', record(14, { seat: 'INF', isInfant: true }), date);
  live.scan('MU578', record(14, { flight: '0578' }), date);
  live.scan('MU586', record(14), '12OCT26');
  assert.equal(db.prepare('SELECT count(*) AS n FROM scans').get().n, 4);
  assert.equal(live.records('MU586', date).rows.filter(row => row.bn).length, 1);
  assert.equal(live.records('MU586', date).rows.find(row => row.infantBn).infantBn, '014');
  assert.throws(() => live.scan('MU578', record(15), date), { code: 'WRONG_FLIGHT' });
});

test('failed companion write rolls back the scan INSERT and publishes no success', t => {
  const { db, live } = harness(t), events = [];
  live.subscribe('MU586', data => events.push(data), date);
  live.insertDetails = { run() { throw Object.assign(new Error('Disk full'), { code: 'SQLITE_FULL' }); } };
  assert.throws(() => live.scan('MU586', record(14), date), { code: 'SQLITE_FULL' });
  assert.equal(db.prepare('SELECT count(*) AS n FROM scans').get().n, 0);
  assert.equal(events.length, 0);
});

test('a failed SSE client cannot make a committed SQLite scan appear failed', t => {
  const { db, live } = harness(t);
  live.subscribe('MU586', () => { throw new Error('Disconnected'); }, date);
  assert.equal(live.scan('MU586', record(14), date).bn, '014');
  assert.equal(db.prepare('SELECT count(*) AS n FROM scans').get().n, 1);
});

test('FB and Add NBRD persist locally; resolution, reopening, and stale versions keep their behavior', t => {
  const { live } = harness(t), events = [];
  live.subscribe('MU586', data => events.push(data), date);
  const entries = nbrdEntriesFromFb([
    { bn: '14', passengerRecord: { gateComments: [' CKIN NBRD VISA ', 'CKIN OK'] } },
    { bn: '15', offloaded: true, passengerRecord: { gateComments: ['CKIN NBRD OFFLOAD'] } },
    { bn: '16', ckinLines: ['CKIN NBRD DOC'] }
  ]);
  assert.deepEqual(entries, [{ bn: '14', detail: 'CKIN NBRD VISA' }, { bn: '16', detail: 'CKIN NBRD DOC' }]);
  live.saveNbrd('MU586', entries, { version: 2 }, date);
  live.saveNbrd('MU586', [{ bn: '17', detail: 'Manual NBRD' }], {}, date);
  assert.throws(() => live.scan('MU586', record(14), date), { code: 'NBRD_MESSAGE' });
  live.resolve('MU586', '14', true, date);
  const beforeUnchanged = events.length;
  live.saveNbrd('MU586', entries, { version: 3 }, date);
  assert.equal(events.length, beforeUnchanged, 'unchanged FB data does not rebroadcast');
  assert.equal(live.nbrdRecords('MU586', date)[0].nbrdResolved, true);
  assert.equal(live.saveNbrd('MU586', [{ bn: '99', detail: 'stale' }], { version: 1 }, date).stale, true);
  assert.equal(live.nbrdRecords('MU586', date).length, 3);
  live.resolve('MU586', '14', false, date);
  assert.throws(() => live.scan('MU586', record(14), date), { code: 'NBRD_MESSAGE' });
  assert.equal(events.length, 4);
  assert.equal(live.nbrdRecords('MU578', date).length, 0);
});

test('NBRD confirmation is atomic with INSERT and rejects changed details', t => {
  const { live } = harness(t);
  live.saveNbrd('MU586', [{ bn: '14', detail: 'VISA' }], {}, date);
  assert.throws(() => live.scan('MU586', record(14, { nbrdConfirmed: true, nbrdConfirmationDetail: 'OLD' }), date), { code: 'NBRD_MESSAGE' });
  const saved = live.scan('MU586', record(14, { nbrdConfirmed: true, nbrdConfirmationDetail: 'VISA' }), date);
  assert.equal(saved.nbrdRows[0].nbrdResolved, true);
  assert.equal(live.nbrdRecords('MU586', date)[0].nbrdResolved, true);
});

test('NBRD knows already boarded passengers from SQLite and regular/emergency views share resolution', t => {
  const { live } = harness(t);
  live.scan('MU586', record(14), date);
  live.saveNbrd('MU586', [{ bn: '14', detail: 'late FB NBRD' }], {}, date);
  const row = live.nbrdRecords('MU586', date)[0];
  assert.equal(row.nbrdResolved, true);
  assert.throws(() => live.removeNbrd('MU586', row.rowNumber, '15', date), { code: 'NBRD_MISMATCH' });
  live.resolve('MU586', '14', false, date);
  live.removeNbrd('MU586', row.rowNumber, '14', date);
  assert.equal(live.nbrdRecords('MU586', date)[0].nbrdResolved, true);
});

test('supplied db.js creates data automatically; scans, NBRD and entered colors survive reopening', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'boarding-sqlite-test-'));
  const context = { require, __dirname: directory, module: { exports: {} }, console: { log() {} } };
  vm.runInNewContext(source, context);
  let db = context.module.exports;
  t.after(() => {
    db.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  let live = new BoardingSqliteLive({ db });
  const saved = live.scan('MU586', record(14), date);
  live.entered('MU586', [saved.rowNumber], true, date);
  live.saveNbrd('MU586', [{ bn: '16', detail: 'VISA' }], {}, date);
  db.close(); db = new Database(path.join(directory, 'data', 'boarding.db'));
  live = new BoardingSqliteLive({ db });
  assert.equal(live.records('MU586', date).rows.find(row => row.bn).entered, true);
  assert.equal(live.nbrdRecords('MU586', date)[0].nbrdBn, '016');
  assert.throws(() => live.scan('MU586', record(14), date), { code: 'DUPLICATE_BN' });
});

test('actual scan handlers preserve parsing/confirmation and both call SQLite without any Sheets access', async t => {
  const server = fs.readFileSync(require.resolve('../index'), 'utf8').replace(/\r\n/g, '\n');
  const { live } = harness(t), routes = new Map();
  const { matchMuFlight, parseEmergencyBoardScan } = require('../cbsScanParser');
  const ctx = vm.createContext({ app: { post: (url, fn) => routes.set(url, fn) },
    boardingLive: live, nbrdConfirmations: createNbrdConfirmationStore(),
    normalizeBoardingFlight: require('../boardingContext').normalizeBoardingFlight,
    boardingDate: () => date, matchMuFlight, parseEmergencyBoardScan,
    require: name => name === './boardingContext' ? require('../boardingContext') : require(name)
  });
  vm.runInContext(server.match(/^function parseCbsPdf417\([^]*?^}/m)[0], ctx);
  for (const url of ['/cbs-scan', '/cbs-scan2']) {
    const begin = server.indexOf(`app.post('${url}',`);
    vm.runInContext(server.slice(begin, server.indexOf('\n});', begin) + 4), ctx);
  }
  async function call(url, body) {
    let status = 200, result;
    await routes.get(url)({ query: {}, body }, { status(value) { status = value; return this; }, json(value) { result = value; } });
    return { status, result };
  }
  const first = await call('/cbs-scan', { rawScan: 'MU0586 010A014' });
  assert.equal(first.status, 200); assert.equal(first.result.bn, '014');
  assert.equal((await call('/cbs-scan2', { rawScan: 'MU586|BN014' })).status, 409);
  live.saveNbrd('MU586', [{ bn: '15', detail: 'VISA' }], {}, date);
  const warning = await call('/cbs-scan', { rawScan: 'MU0586 010A015' });
  assert.equal(warning.result.canBoard, false);
  const challenge = await call('/cbs-scan', { rawScan: 'MU0586 010A015', reviewToken: warning.result.confirmationToken });
  assert.equal(challenge.result.canBoard, true);
  const boarded = await call('/cbs-scan', { rawScan: 'MU0586 010A015', confirmationToken: challenge.result.confirmationToken });
  assert.equal(boarded.status, 200); assert.equal(boarded.result.nbrdRows[0].nbrdResolved, true);
});

test('actual scan routes isolate all four flights and dates in one SQLite database', async t => {
  const source = fs.readFileSync(require.resolve('../index'), 'utf8').replace(/\r\n/g, '\n');
  const { live, db } = harness(t), routes = new Map();
  let middleware;
  const boardingContext = require('../boardingContext');
  const ctx = vm.createContext({ app: {
    post: (url, fn) => routes.set(url, fn), use: (_urls, fn) => { middleware = fn; }
  }, boardingLive: live, nbrdConfirmations: createNbrdConfirmationStore(),
  ...boardingContext, ...require('../cbsScanParser'),
  boardingDate: req => req.query.flightDate,
  require: name => name === './boardingContext' ? boardingContext : require(name) });
  vm.runInContext(source.match(/^function parseCbsPdf417\([^]*?^}/m)[0], ctx);
  const begin = source.indexOf("app.use(['/cbs-scan', '/cbs-scan2']");
  vm.runInContext(source.slice(begin, source.indexOf('\n});', begin) + 4), ctx);
  for (const url of ['/cbs-scan', '/cbs-scan2']) {
    const start = source.indexOf(`app.post('${url}',`);
    vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), ctx);
  }
  async function call(url, flight, rawScan, flightDate = date) {
    let status = 200, data;
    const req = { query: { flightNo: flight, flightDate }, body: { rawScan } };
    const res = { status(value) { status = value; return this; }, json(value) { data = value; } };
    await middleware(req, res, () => routes.get(url)(req, res));
    return { status, data };
  }
  const flights = ['MU586', 'MU9586', 'MU578', 'MU9578'];
  const results = await Promise.all(flights.map(flight => call('/cbs-scan', flight, `${flight} 010A014`)));
  assert.ok(results.every(result => result.status === 200), JSON.stringify(results));
  assert.equal(db.prepare('SELECT count(*) AS n FROM scans').get().n, 4);
  for (const flight of flights) {
    assert.equal(live.records(flight, date).rows.filter(row => row.bn).length, 1);
    assert.equal((await call('/cbs-scan', flight, `${flight} 010A014`)).data.code, 'DUPLICATE_BN');
    assert.equal((await call('/cbs-scan2', flight, `${flight}|BN014`)).data.code, 'DUPLICATE_BN', 'regular and emergency share the same flight/BN');
    const other = flights.find(value => value !== flight);
    assert.equal((await call('/cbs-scan', flight, `${other} 010A015`)).data.code, 'WRONG_FLIGHT');
    assert.equal((await call('/cbs-scan', flight, `${flight} 010A014`, '12OCT26')).status, 200);
    assert.equal((await call('/cbs-scan2', flight, `${flight}|BN016`)).status, 200);
  }
  live.saveNbrd('MU586', [{ bn: '17', detail: 'TEST NBRD' }], {}, date);
  assert.equal((await call('/cbs-scan', 'MU586', 'MU586 010A017')).data.code, 'NBRD_MESSAGE');
  assert.equal((await call('/cbs-scan', 'MU578', 'MU578 010A017')).status, 200);
  assert.equal(live.nbrdRecords('MU578', date).length, 0);
  assert.equal((await call('/cbs-scan', 'MU583', 'MU583 010A018')).data.code, 'WRONG_FLIGHT');
});

test('all scanner and board page scripts still parse; both board pages subscribe to SSE', () => {
  for (const file of ['scan.html', 'scan2.html', 'm-board.html', 'm-board2.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', file), 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if (match[1].trim()) new vm.Script(match[1], { filename: file });
    if (file.startsWith('m-board')) assert.match(html, /connectBoardingLive\(/);
  }
});

test('every regular/emergency boarding route is independent of the Sheets adapter', () => {
  const server = fs.readFileSync(require.resolve('../index'), 'utf8').replace(/\r\n/g, '\n');
  for (const match of server.matchAll(/app\.(?:get|post|delete)\('(\/cbs-scan2?(?:\/[^']*)?)'/g)) {
    const body = server.slice(match.index, server.indexOf('\n});', match.index) + 4);
    assert.doesNotMatch(body, /(?:await )?(?:appendCbsScan|appendEmergencyBoard|getCbsScan|getEmergencyBoard|setCbsScan|setEmergencyBoard|deleteCkinNbrdFromBothSheets|saveCkinNbrdEntriesToBothSheets)/, match[1]);
  }
});

test('ten concurrent HTTP scans reach connected SSE viewers using the existing handlers', async t => {
  const express = require('express'), http = require('node:http');
  const { live } = harness(t);
  const app = express(); app.use(express.json());
  const serverSource = fs.readFileSync(require.resolve('../index'), 'utf8').replace(/\r\n/g, '\n');
  const ctx = vm.createContext({ app, boardingLive: live, nbrdConfirmations: createNbrdConfirmationStore(),
    normalizeBoardingFlight: require('../boardingContext').normalizeBoardingFlight,
    boardingDate: () => date, matchMuFlight: require('../cbsScanParser').matchMuFlight,
    setInterval, clearInterval,
    require: name => name === './boardingContext' ? require('../boardingContext') : require(name)
  });
  vm.runInContext(serverSource.match(/^function parseCbsPdf417\([^]*?^}/m)[0], ctx);
  for (const [method, url] of [['get', '/cbs-scan/live-stream'], ['post', '/cbs-scan']]) {
    const begin = serverSource.indexOf(`app.${method}('${url}',`);
    vm.runInContext(serverSource.slice(begin, serverSource.indexOf('\n});', begin) + 4), ctx);
  }
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let stream, received = '';
  let connectedResolve, connectedReject;
  const connected = new Promise((resolve, reject) => { connectedResolve = resolve; connectedReject = reject; });
  const tenOnSse = new Promise(resolve => {
    stream = http.get(base + '/cbs-scan/live-stream', response => response.on('data', chunk => {
      received += chunk.toString();
      connectedResolve();
      const snapshots = [...received.matchAll(/^data: (.+)$/gm)].map(match => JSON.parse(match[1]));
      if (snapshots.some(snapshot => snapshot.rows.filter(row => row.bn).length === 10)) resolve();
    }));
    stream.on('error', connectedReject);
  });
  t.after(() => { stream.destroy(); server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  await connected;
  const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => fetch(base + '/cbs-scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawScan: `MU0586 010A${String(i + 1).padStart(3, '0')}` })
  }).then(async response => ({ status: response.status, data: await response.json() }))));
  assert.ok(responses.every(response => response.status === 200 && response.data.ok), JSON.stringify(responses));
  let timer;
  try { await Promise.race([tenOnSse, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Missing SSE scan update')), 3000); })]); }
  finally { clearTimeout(timer); }
});

test('07:00 Los Angeles clears all flights, emergency/infant scans and NBRD atomically and broadcasts empty boards', t => {
  let now = Date.parse('2026-10-12T13:59:59Z'), scheduled;
  const confirmations = createNbrdConfirmationStore({ now: () => now });
  const challenge = confirmations.warning('key');
  const { db, live } = harness(t, {}, { now: () => now, onReset: () => confirmations.clear(), timers: {
    setTimeout(fn, delay) { scheduled = { fn, delay }; return { unref() {} }; }, clearTimeout() {}
  } });
  const flights = ['MU586', 'MU9586', 'MU578', 'MU9578'], events = new Map();
  for (const flight of flights) {
    live.subscribe(flight, data => events.set(flight, data), date);
    const saved = live.scan(flight, record(14, { flight }), date);
    live.entered(flight, [saved.rowNumber], true, date);
    live.scan(flight, record(15, { flight, isInfant: true, seat: 'INF' }), date);
    live.saveNbrd(flight, [{ bn: '16', detail: 'NBRD' }], { version: 1 }, date);
  }
  live.startCleanup(); assert.equal(scheduled.delay, 1000);
  now = Date.parse('2026-10-12T14:00:00Z'); scheduled.fn();
  for (const table of ['scans', 'boarding_scan_details', 'boarding_nbrd', 'boarding_nbrd_versions']) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, table);
  }
  for (const flight of flights) assert.deepEqual(events.get(flight).rows, []);
  assert.equal(confirmations.warning('key', challenge.confirmationToken).canBoard, false);
  assert.equal(live.scan('MU9578', record(14, { flight: '9578' }), '12OCT26').bn, '014');
  live.stopCleanup();
});

test('07:00 timing follows summer/winter time and DST transitions without a fixed UTC offset', () => {
  const { nextBoardingCleanup } = require('../boardingCleanupTime');
  for (const [now, next] of [
    ['2026-10-12T13:59:59Z', '2026-10-12T14:00:00Z'],
    ['2026-10-12T14:00:00Z', '2026-10-13T14:00:00Z'],
    ['2026-03-08T09:59:59Z', '2026-03-08T14:00:00Z'],
    ['2026-11-01T08:59:59Z', '2026-11-01T15:00:00Z'],
    ['2026-12-12T14:59:59Z', '2026-12-12T15:00:00Z']
  ]) assert.equal(new Date(nextBoardingCleanup(Date.parse(now))).toISOString(), new Date(next).toISOString());
});

test('ordinary and emergency barcode parsers accept all four selectable departures', () => {
  const { matchMuFlight, parseEmergencyBoardScan } = require('../cbsScanParser');
  const { normalizeBoardingFlight } = require('../boardingContext');
  for (const flight of ['MU586', 'MU9586', 'MU578', 'MU9578']) {
    assert.equal(normalizeBoardingFlight(flight), flight);
    assert.equal(matchMuFlight(flight + ' 010A014').supported, true);
    assert.equal(normalizeBoardingFlight(parseEmergencyBoardScan(flight + '|BN014').flight), flight);
  }
});

test('restart catches a missed 07:00 cleanup using persisted maintenance state', t => {
  let now = Date.parse('2026-10-12T13:50:00Z');
  const { db, live } = harness(t, {}, { now: () => now });
  live.scan('MU586', record(14), date);
  now = Date.parse('2026-10-12T15:00:00Z');
  const restarted = new BoardingSqliteLive({ db, now: () => now });
  assert.equal(db.prepare('SELECT count(*) AS n FROM scans').get().n, 0);
  assert.equal(new Date(restarted.nextCleanupAt).toISOString(), '2026-10-13T14:00:00.000Z');
});

test('failed cleanup rolls back every table and retries without losing scan data', t => {
  let now = Date.parse('2026-10-12T13:50:00Z');
  const { db, live } = harness(t, {}, { now: () => now });
  live.scan('MU586', record(14), date);
  live.saveNbrd('MU586', [{ bn: '16', detail: 'NBRD' }], {}, date);
  db.exec("CREATE TRIGGER block_cleanup BEFORE DELETE ON boarding_nbrd BEGIN SELECT RAISE(ABORT,'blocked'); END;");
  now = Date.parse('2026-10-12T14:00:00Z');
  assert.throws(() => live.cleanupIfDue(), /blocked/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM scans').get().n, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_scan_details').get().n, 1);
  db.exec('DROP TRIGGER block_cleanup;');
  assert.equal(live.cleanupIfDue(), true);
  assert.equal(db.prepare('SELECT count(*) AS n FROM scans').get().n, 0);
});

test('manual clearing resets only the selected flight/date and invalidates only its NBRD challenges', t => {
  const confirmations = createNbrdConfirmationStore(), events = [];
  const { db, live } = harness(t, {}, { onReset: scope => confirmations.clearScope(scope.flight, scope.date) });
  const key = confirmations.key('MU586', date, 'BARCODE'), otherKey = confirmations.key('MU578', date, 'BARCODE');
  const first = confirmations.warning(key), otherFirst = confirmations.warning(otherKey);
  const token = confirmations.warning(key, first.confirmationToken), otherToken = confirmations.warning(otherKey, otherFirst.confirmationToken);
  for (const flight of ['MU586', 'MU9586', 'MU578', 'MU9578']) {
    live.scan(flight, record(14, { flight }), date);
    live.saveNbrd(flight, [{ bn: '16', detail: 'NBRD' }], { version: 1 }, date);
  }
  live.scan('MU586', record(15, { isInfant: true, seat: 'INF' }), date);
  live.scan('MU586', record(14), '12OCT26');
  const cutoff = live.nextCleanupAt;
  live.subscribe('MU586', data => events.push(data), date);
  const result = live.resetFlight('MU586', date);
  assert.deepEqual(result.cleared, { scans: 2, nbrd: 1 });
  assert.deepEqual(events.at(-1).rows, []);
  assert.equal(db.prepare('SELECT count(*) AS n FROM scans').get().n, 4);
  assert.equal(live.records('MU586', '12OCT26').rows.filter(row => row.bn).length, 1);
  assert.equal(live.nbrdRecords('MU578', date).length, 1);
  assert.equal(live.nextCleanupAt, cutoff, 'manual reset must not postpone the daily 07:00 reset');
  assert.equal(confirmations.canBoard(token.confirmationToken, confirmations.key('MU586', date, 'BARCODE')), false);
  assert.equal(confirmations.canBoard(otherToken.confirmationToken, confirmations.key('MU578', date, 'BARCODE')), true);
  assert.equal(live.scan('MU586', record(14), date).bn, '014');
});

test('manual clear endpoint requires confirmation and the buttons sit below Infant Scan', t => {
  const { live } = harness(t);
  live.scan('MU586', record(14), date);
  const server = fs.readFileSync(require.resolve('../index'), 'utf8').replace(/\r\n/g, '\n');
  let handler;
  const context = vm.createContext({ app: { post: (_, fn) => { handler = fn; } }, boardingLive: live,
    boardingDate: () => date, require: name => name === './boardingContext' ? require('../boardingContext') : require(name) });
  const begin = server.indexOf("app.post('/cbs-scan/clear',");
  vm.runInContext(server.slice(begin, server.indexOf('\n});', begin) + 4), context);
  function call(body) {
    let status = 200, data;
    handler({ body, query: {} }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  }
  assert.equal(call({}).status, 400);
  assert.equal(live.records('MU586', date).rows.length, 1);
  assert.equal(call({ confirm: true }).status, 200);
  assert.deepEqual(live.records('MU586', date).rows, []);
  for (const file of ['m-board.html', 'm-board2.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', file), 'utf8');
    assert.ok(html.indexOf('id="clear-board"') > html.indexOf('id="infant-wrap"'));
    assert.match(html, /window\.confirm\('确认清空 '/);
  }
});
