'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { BoardingLive, NBRD_INTERVAL_MS, BACKUP_INTERVAL_MS } = require('../boardingLive');
const { BoardingLiveStore } = require('../boardingLiveStore');
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

function harness(overrides = {}) {
  let saved = { schema: 1, revision: 0, flights: {} };
  let now = 100000;
  let nextTimer = 0;
  const timers = new Map();
  const calls = { seed: [], read: [], backup: [] };
  const nbrd = {};
  const store = { load: async () => structuredClone(saved), save: async value => { saved = structuredClone(value); } };
  const sheets = {
    seed: async flight => { calls.seed.push(flight); return { title: flight, rows: [], nbrd: nbrd[flight] || [] }; },
    readNbrd: async boards => { calls.read.push(structuredClone(boards)); return Object.fromEntries(boards.map(board => [board.flight, nbrd[board.flight] || []])); },
    backup: async batch => { calls.backup.push(structuredClone(batch)); }, ...overrides
  };
  const live = new BoardingLive({ store, sheets, now: () => now, timers: {
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); }
  }, report: () => {} });
  return { live, calls, nbrd, store, state: () => saved, now: () => now,
    setNow: value => { now = value; },
    async tickTo(time) {
      while (true) {
        const item = [...timers].filter(([, task]) => task.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
        if (!item) break;
        timers.delete(item[0]); now = item[1].at; await item[1].fn();
      }
      now = time;
    }
  };
}
const scan = (bn, flight = 'MU586', extra = {}) => ({ bn: String(bn), seat: '10A', flight, rawScan: `PRIVATE-${bn}`, ...extra });

test('ten concurrent scanners acknowledge durable saves before the six-second backup', async () => {
  const h = harness();
  const updates = [];
  h.live.subscribe('MU586', snapshot => updates.push(snapshot));
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => h.live.scan('MU586', scan(i + 1))));
  assert.equal(h.calls.seed.length, 1);
  assert.equal(h.calls.backup.length, 0);
  assert.equal(new Set(results.map(row => row.rowNumber)).size, 10);
  assert.equal(h.state().flights.MU586.rows.length, 10);
  assert.equal(updates.at(-1).rows.length, 10);
  assert.doesNotMatch(JSON.stringify(updates), /PRIVATE-/);
  await h.tickTo(105999);
  assert.equal(h.calls.backup.length, 0);
  await h.tickTo(106000);
  assert.equal(h.calls.backup.length, 1);
  assert.equal(Object.keys(h.calls.backup[0][0].dirty).filter(key => key.startsWith('scan:')).length, 10);
  assert.equal(h.live.snapshot('MU586').backupPending, false);
  await h.live.close();
});

test('three flights share twenty reads and ten backup requests in a minute', async () => {
  const h = harness();
  for (const flight of ['MU586', 'MU9586', 'MU578']) await h.live.ensure(flight);
  for (let cycle = 1; cycle <= 20; cycle++) {
    await Promise.all(['MU586', 'MU9586', 'MU578'].map(flight =>
      Promise.all(Array.from({ length: 10 }, (_, index) => h.live.scan(flight, scan(cycle * 10 + index, flight))))));
    await h.tickTo(100000 + cycle * 3000);
  }
  assert.equal(h.calls.read.length, 20);
  assert.ok(h.calls.read.every(batch => batch.length === 3));
  assert.equal(h.calls.backup.length, 10);
  assert.ok(h.calls.backup.every(batch => batch.length === 3));
  assert.equal(h.state().flights.MU586.rows.length, 200);
  await h.tickTo(1120000);
  assert.equal(h.calls.backup.length, 10, 'idle cycles never write');
  await h.live.close();
});

test('manual Sheet NBRD additions push to both clients and block scans without a per-scan read', async () => {
  const h = harness();
  await h.live.ensure('MU586');
  const first = [], second = [];
  h.live.subscribe('MU586', data => first.push(data));
  h.live.subscribe('MU586', data => second.push(data));
  h.nbrd.MU586 = [{ rowNumber: 2, bn: '014', detail: 'CHECK DOCUMENT' }];
  await h.tickTo(103000);
  assert.equal(first.at(-1).nbrd[0].detail, 'CHECK DOCUMENT');
  assert.deepEqual(first, second);
  await assert.rejects(h.live.scan('MU586', scan(14)), error => error.code === 'NBRD_MESSAGE');
  await h.live.scan('MU586', scan(15));
  assert.equal(h.calls.read.length, 1);
  assert.equal(h.state().flights.MU586.rows.length, 1);
  const count = first.length;
  await h.tickTo(106000);
  assert.equal(first.length, count + 1, 'only backup completion publishes; unchanged NBRD does not');
  await h.live.close();
});

test('concurrent duplicate BNs are rejected, with independent adult/infant and flight namespaces', async () => {
  const h = harness();
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => h.live.scan('MU586', scan(14))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(results.filter(result => result.status === 'rejected').every(result => result.reason.code === 'DUPLICATE_BN'));
  await h.live.scan('MU586', scan(14, 'MU586', { seat: 'INF', isInfant: true }));
  await h.live.scan('MU578', scan(14, 'MU578'));
  await assert.rejects(h.live.scan('MU586', scan(15, 'MU578')), error => error.code === 'WRONG_FLIGHT');
  await h.live.close();
});

test('a failed durable save neither acknowledges nor publishes a scan', async () => {
  const h = harness(); await h.live.ensure('MU586');
  let events = 0; h.live.subscribe('MU586', () => events++);
  h.store.save = async () => { throw new Error('Disk full'); };
  await assert.rejects(h.live.scan('MU586', scan(1)), /Disk full/);
  assert.equal(h.live.snapshot('MU586').rows.length, 0);
  assert.equal(events, 0);
  await h.live.close();
});

test('backup failures retain pending records and restart replays idempotent row assignments', async () => {
  const h = harness({ backup: async () => { throw new Error('Sheets down'); } });
  await h.live.scan('MU586', scan(1));
  await assert.rejects(h.live.backup(), /Sheets down/);
  assert.equal(h.live.snapshot('MU586').backupPending, true);
  await h.live.close();
  const replay = harness(); replay.store.load = async () => structuredClone(h.state());
  await replay.live.start();
  await replay.live.ensure('MU586');
  assert.equal(replay.calls.seed.length, 0, 'restart imports durable state, not stale Sheet scans');
  await replay.live.backup();
  assert.equal(replay.calls.backup[0][0].rows[0].rowNumber, 2);
  assert.equal(replay.live.snapshot('MU586').backupPending, false);
  await assert.rejects(replay.live.scan('MU586', scan(1)), error => error.code === 'DUPLICATE_BN');
  await replay.live.close();
});

test('a slow backup does not block scanning or lose newer entered-state changes', async () => {
  const gate = deferred();
  const h = harness({ backup: async () => gate.promise });
  await h.live.scan('MU586', scan(1));
  await h.live.entered('MU586', [2], true);
  const saving = h.live.backup();
  const result = await h.live.scan('MU586', scan(2));
  assert.equal(result.rowNumber, 3);
  await h.live.entered('MU586', [2], false);
  gate.resolve(); await saving;
  const dirty = h.state().flights.MU586.dirty;
  assert.ok(dirty['scan:3']); assert.ok(dirty['entered:2']); assert.equal(dirty['scan:2'], undefined);
  assert.equal(h.live.snapshot('MU586').rows[0].entered, false);
  await h.live.close();
});

test('overlapping refreshes and backups share one in-flight request', async () => {
  const readGate = deferred(), backupGate = deferred(); let reads = 0, writes = 0;
  const h = harness({
    readNbrd: async () => { reads++; await readGate.promise; return { MU586: [] }; },
    backup: async () => { writes++; await backupGate.promise; }
  });
  await h.live.scan('MU586', scan(1));
  const polls = [h.live.poll(), h.live.poll(), h.live.poll()];
  const backups = [h.live.backup(), h.live.backup(), h.live.backup()];
  assert.equal(reads, 1); assert.equal(writes, 1);
  readGate.resolve(); backupGate.resolve(); await Promise.all([...polls, ...backups]);
  await h.live.close();
});

test('stale NBRD fails closed and recovers after the shared reader succeeds', async () => {
  const h = harness(); await h.live.ensure('MU586');
  h.live.sheets.readNbrd = async () => { throw new Error('Quota cooldown'); };
  await h.tickTo(118000);
  await assert.rejects(h.live.scan('MU586', scan(1)), error => error.code === 'NBRD_UNAVAILABLE');
  h.live.sheets.readNbrd = async () => ({ MU586: [] });
  await h.live.poll();
  await h.live.scan('MU586', scan(1));
  await h.live.close();
});

test('file store survives reopening, rejects a second writer and refuses corrupt state', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'boarding-live-test-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const first = new BoardingLiveStore(directory);
  await first.load();
  await first.save({ schema: 1, revision: 4, flights: { MU586: { dirty: { 'scan:2': 4 } } } });
  await assert.rejects(new BoardingLiveStore(directory).load(), /active writer/);
  await first.close();
  const second = new BoardingLiveStore(directory);
  assert.equal((await second.load()).flights.MU586.dirty['scan:2'], 4);
  await second.close();
  const { DatabaseSync } = require('node:sqlite');
  const corrupt = new DatabaseSync(path.join(directory, 'state.sqlite'));
  corrupt.prepare('UPDATE boarding_state SET json = ?').run('broken');
  corrupt.close();
  const third = new BoardingLiveStore(directory);
  await assert.rejects(third.load(), SyntaxError);
  await third.close();
});

test('a process crash releases the writer lease and preserves an acknowledged pending scan', { timeout: 15000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'boarding-live-crash-'));
  const program = `
    const { BoardingLiveStore } = require(process.argv[2]);
    const { BoardingLive } = require(process.argv[3]);
    const live = new BoardingLive({ store: new BoardingLiveStore(process.argv[1]), sheets: {
      seed: async () => ({ title: 'Regular', rows: [], nbrd: [] }),
      readNbrd: async () => ({ MU586: [] }), backup: async () => {}
    } });
    live.scan('MU586', { bn: '14', seat: '10A', flight: 'MU586', rawScan: 'BARCODE' })
      .then(() => { process.stdout.write('saved'); setInterval(() => {}, 1000); })
      .catch(error => { console.error(error); process.exit(1); });
  `;
  const child = spawn(process.execPath, ['-e', program, directory, require.resolve('../boardingLiveStore'), require.resolve('../boardingLive')], { windowsHide: true });
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  });
  await Promise.race([
    once(child.stdout, 'data').then(([data]) => assert.match(String(data), /saved/)),
    exited.then(() => { throw new Error('Child exited before save acknowledgement.'); })
  ]);
  child.kill(); await exited;
  const restored = new BoardingLiveStore(directory);
  const state = await restored.load();
  assert.equal(state.flights.MU586.rows[0].bn, '014');
  assert.ok(state.flights.MU586.dirty['scan:2']);
  await restored.close();
});

test('Sheet adapter batches all flights and only touches scan/infant columns and entered colors', async () => {
  const source = await fs.readFile(require.resolve('../googleDrive'), 'utf8');
  const extract = name => source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'))[0];
  const reads = [], writes = [];
  const ctx = vm.createContext({
    require, Object, String, Array, Number,
    CBS_SCAN_SHEET_ID: 'sheet', escapeSheetTitle: value => `'${value}'`,
    formatCbsScanSheetBn: value => value ? String(value).padStart(4, '0').slice(-3) : '',
    normalizeCbsScanNbrdDetail: value => String(value || '').trim(),
    cbsScanSheetsCall: fn => fn(),
    sheets: { spreadsheets: {
      values: { batchGet: async request => { reads.push(request); return { data: { valueRanges: [{ values: [['014', 'Document']] }, { values: [] }] } }; } },
      batchUpdate: async request => { writes.push(request); }
    } }
  });
  ctx.require = name => name === './boardingContext' ? require('../boardingContext') : require(name);
  for (const name of ['boardingLiveNbrdRows', 'readBoardingLiveNbrd', 'boardingLiveBackupRequests', 'backupBoardingLive']) vm.runInContext(extract(name), ctx);
  const result = await ctx.readBoardingLiveNbrd([{ flight: 'MU586', title: 'Regular' }, { flight: 'MU578', title: 'Other' }]);
  assert.equal(reads.length, 1); assert.equal(reads[0].ranges.length, 2); assert.equal(result.MU586[0].bn, '014');
  await ctx.backupBoardingLive([
    { flight: 'MU586', dirty: { 'scan:2': 1, 'infant:2': 2, 'entered:2': 3 }, rows: [{ rowNumber: 2, values: ['014', '10A', 'MU586', 'RAW', 'NOW'], infantValues: ['015', 'INF', 'MU586', 'RAW', 'NOW'], entered: true }] },
    { flight: 'MU578', dirty: { 'scan:3': 1 }, rows: [{ rowNumber: 3, values: ['016', '12A', 'MU578', 'RAW', 'NOW'] }] }
  ]);
  assert.equal(writes.length, 1);
  const requests = writes[0].requestBody.requests;
  assert.equal(requests.length, 4);
  for (const request of requests) {
    if (request.updateCells) {
      assert.ok([0, 13].includes(request.updateCells.start.columnIndex));
      assert.equal(request.updateCells.rows[0].values.length, 5);
      assert.equal(request.updateCells.fields, 'userEnteredValue');
    } else {
      assert.equal(request.repeatCell.range.endColumnIndex, 3);
      assert.equal(request.repeatCell.fields, 'userEnteredFormat.backgroundColor');
    }
  }
  assert.equal(NBRD_INTERVAL_MS, 3000); assert.equal(BACKUP_INTERVAL_MS, 6000);
});
