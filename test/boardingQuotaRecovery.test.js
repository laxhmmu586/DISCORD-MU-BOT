const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const drive = fs.readFileSync(path.join(__dirname, '..', 'googleDrive.js'), 'utf8').replace(/\r\n/g, '\n');
const sourceFunction = (source, name) => {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, name);
  return match[0];
};
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function clockHarness(extra = {}) {
  let now = 0, sequence = 0;
  const timers = new Map();
  const state = { cbsScanAppendPending: [], cbsScanAppendTimer: null, cbsScanAppendRunning: false, cbsScanSheetCache: {} };
  const context = vm.createContext({
    ...require('../boardingContext'), boardingState: () => state,
    Date: class extends Date { static now() { return now; } },
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    ...extra
  });
  return {
    context, timers, now: () => now,
    async next() {
      await settle();
      const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      assert.ok(entry, 'expected a scheduled timer');
      timers.delete(entry[0]);
      now = entry[1].at;
      entry[1].fn();
      await settle();
    }
  };
}

function quotaHarness() {
  const h = clockHarness();
  vm.runInContext(drive.slice(drive.indexOf('function isCbsScanQuotaError('), drive.indexOf('async function getCbsScanSheetTitle(')), h.context);
  return h;
}
const quotaError = () => Object.assign(new Error('Read quota exceeded'), { code: 429 });

test('ten concurrent scanners stay within the shared rolling minute budget', async () => {
  const h = quotaHarness();
  const calls = [];
  const scanners = Array.from({ length: 10 }, (_, scanner) => (async () => {
    for (let scan = 0; scan < 6; scan++) {
      await h.context.cbsScanSheetsCall(async () => calls.push({ at: h.now(), scanner, scan, type: 'read' }), 'board read', 'scan', 'read');
      await h.context.cbsScanSheetsCall(async () => calls.push({ at: h.now(), scanner, scan, type: 'write' }), 'board write', 'scan');
    }
  })());
  await settle();
  for (let turn = 0; calls.length < 120 && turn < 100; turn++) {
    await settle();
    if (h.timers.size) await h.next();
  }
  assert.equal(calls.length, 120);
  await Promise.all(scanners);
  for (const call of calls) {
    assert.ok(calls.filter(other => other.type === call.type && other.at > call.at - 60000 && other.at <= call.at).length <= 50);
  }
  assert.equal(calls.filter(call => call.type === 'write').length, 60);
  assert.equal(h.timers.size, 0);
});

test('a full budget waits for refill and keeps scans ahead of background refreshes', async () => {
  const h = quotaHarness();
  for (let i = 0; i < 50; i++) await h.context.cbsScanSheetsCall(async () => {});
  const calls = [];
  const background = h.context.cbsScanSheetsCall(async () => calls.push('background'), 'board read', 'background');
  const scan = h.context.cbsScanSheetsCall(async () => calls.push('scan'), 'board write', 'scan');
  await settle();
  assert.deepEqual(calls, []);
  assert.equal(h.timers.size, 1);
  await h.next();
  await Promise.all([background, scan]);
  assert.equal(h.now(), 60000);
  assert.deepEqual(calls, ['scan', 'background']);
});

test('normal reads and writes use independent budgets without artificial delays', async () => {
  const h = quotaHarness();
  for (let i = 0; i < 50; i++) {
    await h.context.cbsScanSheetsCall(async () => {}, 'read', 'scan', 'read');
    await h.context.cbsScanSheetsCall(async () => {}, 'write', 'scan');
  }
  assert.equal(h.now(), 0);
  assert.equal(h.timers.size, 0);
});

test('failed attempts also consume the proactive request budget', async () => {
  const h = quotaHarness();
  for (let i = 0; i < 50; i++) {
    await assert.rejects(h.context.cbsScanSheetsCall(async () => { throw new Error('Permission denied'); }));
  }
  let saved = false;
  const pending = h.context.cbsScanSheetsCall(async () => { saved = true; });
  await settle();
  assert.equal(saved, false);
  await h.next();
  await pending;
  assert.equal(h.now(), 60000);
  assert.equal(saved, true);
});

test('scan retries survive a minute-long quota window and only resolve after Sheets succeeds', async () => {
  const h = quotaHarness();
  const calls = [];
  let confirmed = false;
  const pending = h.context.cbsScanSheetsCall(async () => {
    calls.push(h.now());
    if (h.now() < 60000) throw quotaError();
    return 'written';
  }, 'scan write', 'scan').then(value => { confirmed = true; return value; });
  await settle();
  for (let i = 0; i < 5; i++) await h.next();
  assert.equal(confirmed, false);
  await h.next();
  assert.equal(await pending, 'written');
  assert.deepEqual(calls, [0, 1000, 3000, 7000, 15000, 31000, 63000]);
});

test('quota cooldown pauses other callers and gives pending scans priority over background reads', async () => {
  const h = quotaHarness();
  const calls = [];
  let first = true;
  const background = h.context.cbsScanSheetsCall(async () => {
    calls.push('background');
    if (first) { first = false; throw quotaError(); }
  }, 'background', 'background');
  await settle();
  const scan = h.context.cbsScanSheetsCall(async () => calls.push('scan'), 'scan', 'scan');
  await settle();
  assert.deepEqual(calls, ['background']);
  await h.next();
  await Promise.all([background, scan]);
  assert.deepEqual(calls, ['background', 'scan', 'background']);
});

test('quota retry honors Retry-After and does not retry permission failures', async () => {
  const h = quotaHarness();
  let attempts = 0;
  const pending = h.context.cbsScanSheetsCall(async () => {
    if (++attempts === 1) throw Object.assign(quotaError(), { response: { headers: { 'retry-after': '45' } } });
  });
  await settle();
  await h.next();
  await pending;
  assert.equal(h.now(), 45000);
  const denied = Object.assign(new Error('Permission denied'), { code: 403 });
  await assert.rejects(h.context.cbsScanSheetsCall(async () => { throw denied; }), err => err === denied);
  assert.equal(h.timers.size, 0);
});

test('persistent quota failure is bounded and reports SHEETS_QUOTA', async () => {
  const h = quotaHarness();
  let attempts = 0;
  const pending = h.context.cbsScanSheetsCall(async () => { attempts++; throw quotaError(); }).catch(err => err);
  await settle();
  for (let i = 0; i < 6; i++) await h.next();
  assert.equal((await pending).code, 'SHEETS_QUOTA');
  assert.equal(attempts, 7);
});

for (const [prefix, name] of [['cbsScan', 'CbsScan'], ['emergencyBoard', 'EmergencyBoard']]) {
  for (const scannerCount of [6, 10]) {
    test(`${name} batches ${scannerCount} simultaneous scanners within the shared quota`, async () => {
      const rows = [[]], writes = [], calls = [];
      const h = clockHarness({
        CBS_SCAN_SHEET_ID: 'regular', EMERGENCY_BOARD_SHEET_ID: 'emergency',
        escapeSheetTitle: value => value,
        [`get${name}SheetTitle`]: async () => 'Board',
        [`ensure${name}SheetHeaders`]: async () => false,
        sheets: { spreadsheets: { values: { batchUpdate: async ({ requestBody }) => {
          calls.push({ at: h.now(), type: 'write' });
          writes.push(requestBody.data);
          for (const update of requestBody.data) {
            const number = Number(update.range.match(/![AN](\d+)/)[1]);
            const start = update.range.includes('!N') ? 13 : 0;
            while (rows.length < number) rows.push([]);
            update.values[0].forEach((value, index) => { rows[number - 1][start + index] = value; });
          }
        } } } }
      });
      vm.runInContext(drive.slice(drive.indexOf('function isCbsScanQuotaError('), drive.indexOf('async function getCbsScanSheetTitle(')), h.context);
      h.context[`get${name}SheetRows`] = () => h.context.cbsScanSheetsCall(async () => {
        calls.push({ at: h.now(), type: 'read' });
        return rows.map(row => [...row]);
      }, 'scan read', 'scan', 'read');
      vm.runInContext(`let ${prefix}AppendPending = [], ${prefix}AppendTimer = null, ${prefix}AppendRunning = false, ${prefix}SheetCache = {};`, h.context);
      for (const fn of [`normalize${name}Bn`, `format${name}SheetBn`, `throw${name}NbrdMessage`, `make${name}DuplicateError`, `apply${name}WorkingRow`, `prepare${name}Append`, `process${name}AppendBatch`, `flush${name}AppendBatch`, `append${name}Record`]) {
        vm.runInContext(sourceFunction(drive, fn), h.context);
      }
      const saved = [];
      // More than one minute of API budget: verify actual batches also queue
      // through the proactive limiter without dropping or overwriting records.
      for (let round = 0; round < 60; round++) {
        let done = false;
        const pending = Promise.all(Array.from({ length: scannerCount }, (_, scanner) =>
          h.context[`append${name}Record`]({ bn: String(round * scannerCount + scanner + 1), seat: '10A', flight: 'MU586' })
        )).then(results => { saved.push(...results); done = true; });
        while (!done) await h.next();
        await pending;
        if (round === 0) assert.equal(h.now(), 750, 'ordinary scans only wait for the batching window');
      }
      assert.equal(saved.length, scannerCount * 60);
      assert.equal(new Set(saved.map(record => record.rowNumber)).size, saved.length);
      assert.equal(writes.length, 60);
      assert.ok(writes.every(batch => batch.length === scannerCount));
      for (const call of calls) assert.ok(calls.filter(other => other.type === call.type && other.at > call.at - 60000 && other.at <= call.at).length <= 50);
      assert.equal(h.timers.size, 0);
    });
  }

  test(`${name} merges scans waiting behind a slow write and keeps duplicate/NBRD checks`, async () => {
    const gate = deferred();
    const rows = [[]];
    const writes = [];
    let reads = 0;
    const h = clockHarness({
      CBS_SCAN_SHEET_ID: 'regular', EMERGENCY_BOARD_SHEET_ID: 'emergency',
      escapeSheetTitle: value => value,
      [`get${name}SheetTitle`]: async () => 'Board',
      [`get${name}SheetRows`]: async () => { reads++; return rows.map(row => [...row]); },
      [`ensure${name}SheetHeaders`]: async () => false,
      cbsScanSheetsCall: fn => fn(),
      sheets: { spreadsheets: { values: { batchUpdate: async ({ requestBody }) => {
        writes.push(requestBody.data);
        if (writes.length === 1) await gate.promise;
        for (const update of requestBody.data) {
          const rowNumber = Number(update.range.match(/![AN](\d+)/)[1]);
          const start = update.range.includes('!N') ? 13 : 0;
          while (rows.length < rowNumber) rows.push([]);
          update.values[0].forEach((value, index) => { rows[rowNumber - 1][start + index] = value; });
        }
      } } } }
    });
    vm.runInContext(`let ${prefix}AppendPending = [], ${prefix}AppendTimer = null, ${prefix}AppendRunning = false, ${prefix}SheetCache = {};`, h.context);
    for (const fn of [`normalize${name}Bn`, `format${name}SheetBn`, `throw${name}NbrdMessage`, `make${name}DuplicateError`, `apply${name}WorkingRow`, `prepare${name}Append`, `process${name}AppendBatch`, `flush${name}AppendBatch`, `append${name}Record`]) {
      vm.runInContext(sourceFunction(drive, fn), h.context);
    }
    const append = h.context[`append${name}Record`];
    let acknowledged = false;
    const first = append({ bn: '1', seat: '10A', flight: 'MU586' }).then(result => { acknowledged = true; return result; });
    await h.next();
    assert.equal(acknowledged, false, 'receiving or batching a scan is not a successful save');
    const second = append({ bn: '2', seat: '10B', flight: 'MU586' });
    const infant = append({ bn: '3', seat: 'INF', flight: 'MU586' });
    const duplicate = append({ bn: '2', seat: '10B', flight: 'MU586' }).catch(err => err);
    const blocked = append({ bn: '4', seat: '10C', flight: 'MU586' }).catch(err => err);
    assert.equal(h.timers.size, 0, 'do not create separate batches during the slow write');
    gate.resolve();
    await first;
    rows[1][11] = '004'; rows[1][12] = 'Check with agent';
    await h.next();
    assert.equal((await second).rowNumber, 3);
    assert.equal((await infant).isInfant, true);
    assert.equal((await duplicate).code, 'DUPLICATE_BN');
    assert.equal((await blocked).code, 'NBRD_MESSAGE');
    assert.deepEqual(writes.map(batch => batch.length), [1, 2]);
    assert.equal(reads, 2);
  });

  test(`${name} board refresh avoids rereading unchanged headers`, async () => {
    let reads = 0, headersChanged = false;
    const context = vm.createContext({
      ...require('../boardingContext'),
      [`get${name}SheetRows`]: async () => { reads++; return [[]]; },
      [`ensure${name}SheetHeaders`]: async () => headersChanged,
      [`get${name}SheetTitle`]: async () => 'Board',
      [`get${name}EnteredRowNumbers`]: async () => new Set()
    });
    vm.runInContext(sourceFunction(drive, `get${name}Records`), context);
    await context[`get${name}Records`]();
    assert.equal(reads, 1);
    headersChanged = true;
    await context[`get${name}Records`]();
    assert.equal(reads, 3, 'header repairs still force a fresh read');
  });
}

for (const file of ['scan.html', 'scan2.html']) {
  test(`${file} ignores identical barcodes for 2500ms and accepts other barcodes`, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public/public', file), 'utf8');
    const guard = html.match(/if \(text === lastScanText[^\n]+/)[0];
    const context = vm.createContext({ lastScanText: 'pass', lastScanAt: 1000 });
    vm.runInContext(`function accepts(text, now) { ${guard} return true; }`, context);
    assert.equal(context.accepts('pass', 3499), undefined);
    assert.equal(context.accepts('pass', 3500), true);
    assert.equal(context.accepts('other pass', 1001), true);
    assert.match(html, /lastScanText = text;\s*lastScanAt = now;/);
  });

  test(`${file} keeps a pending save visible and clears the waiting timer on completion`, async () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public/public', file), 'utf8');
    const handler = html.match(/    async function handleText\(text\) \{[\s\S]*?\n    }/)[0];
    const gate = deferred();
    const start = { disabled: false };
    const result = { hidden: false };
    let status;
    const h = clockHarness({
      document: { querySelector: () => start }, resultEl: result,
      setStatus: value => { status = value; }, saveScan: () => gate.promise
    });
    vm.runInContext(handler, h.context);
    const pending = h.context.handleText('boarding pass');
    assert.equal(start.disabled, true);
    assert.equal(result.hidden, true);
    await h.next();
    assert.match(status, /Still saving/);
    assert.equal(start.disabled, true);
    gate.reject(new Error('Not saved'));
    await pending;
    assert.equal(status, 'Not saved');
    assert.equal(start.disabled, false);
    assert.equal(h.timers.size, 0);
    assert.match(html, /if \(!result \|\| scanBusy \|\| !dialog.hidden\) return/);
  });

  test(`${file} shows success only after the server confirms persistence`, async () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public/public', file), 'utf8');
    const source = html.match(/    async function saveScan\(rawScan\) \{[\s\S]*?\n    }/)[0];
    const response = deferred();
    const messages = [], results = [];
    const context = vm.createContext({
      apiBase: '', fetch: () => response.promise,
      setStatus: () => {}, showMessage: (...args) => messages.push(args), renderResult: result => results.push(result)
    });
    vm.runInContext(source, context);
    const pending = context.saveScan('pass');
    await settle();
    assert.equal(messages.length, 0);
    assert.equal(results.length, 0);
    response.resolve({ ok: true, json: async () => ({ bn: '001', seat: '10A' }) });
    await pending;
    assert.equal(messages[0][2], 'success');
    assert.equal(results.length, 1);
    context.fetch = async () => ({ ok: false, json: async () => ({ code: 'SHEETS_QUOTA' }) });
    await assert.rejects(context.saveScan('pass'), /Not saved/);
    assert.equal(messages[1][2], 'error');
    assert.equal(results.length, 1, 'failed saves never render another successful result');
  });
}
