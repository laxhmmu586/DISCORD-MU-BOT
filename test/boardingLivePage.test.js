'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'public', 'public');
const connector = fs.readFileSync(path.join(root, 'boarding-live.js'), 'utf8');

function browser(response = { live: true, revision: 4, rows: [], nbrd: [] }) {
  const streams = [], fetches = [], timers = [], boards = [], statuses = [], handlers = {};
  const window = { mufcFlight: { flightNo: 'MU578', flightDate: '11OCT26' }, addEventListener: (name, fn) => { handlers[name] = fn; } };
  const ctx = vm.createContext({ window, URL, Number, JSON,
    fetch: async (url, options) => { fetches.push({ url, options }); return { ok: true, json: async () => response }; },
    EventSource: class {
      constructor(url) { this.url = url; this.handlers = {}; streams.push(this); }
      addEventListener(name, fn) { this.handlers[name] = fn; }
      close() { this.closed = true; }
    },
    setTimeout: (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.cleared = true; }
  });
  vm.runInContext(connector, ctx);
  return { ctx, window, streams, fetches, timers, boards, statuses, handlers,
    connect: () => window.connectBoardingLive({ apiBase: 'https://api.mufcapp.net', onBoard: board => boards.push(board), onStatus: status => statuses.push(status) }) };
}

test('browser receives a flight-scoped snapshot and updates without any Sheets refetch', async () => {
  const h = browser(); assert.equal(await h.connect(), true);
  assert.equal(h.fetches.length, 1);
  assert.equal(h.fetches[0].options.cache, 'no-store');
  const stream = h.streams[0];
  const url = new URL(stream.url);
  assert.equal(url.searchParams.get('flightNo'), 'MU578'); assert.equal(url.searchParams.get('flightDate'), '11OCT26');
  stream.onopen();
  stream.handlers.board({ data: JSON.stringify({ revision: 5, rows: [{ bn: '014' }], nbrd: [{ bn: '015' }] }) });
  stream.handlers.board({ data: JSON.stringify({ revision: 3, rows: [] }) });
  assert.equal(h.boards.at(-1).rows[0].bn, '014');
  assert.equal(h.fetches.length, 1);
  stream.onerror(); assert.equal(h.statuses.at(-1), 'Reconnecting…');
  stream.onopen(); stream.handlers.board({ data: JSON.stringify({ revision: 6, rows: [{ bn: '014' }, { bn: '015' }] }) });
  assert.equal(h.boards.at(-1).rows.length, 2);
  assert.equal(h.streams.length, 1, 'EventSource handles reconnection itself');
  h.handlers.pagehide(); assert.equal(stream.closed, true);
});

test('unconfigured deployment falls back to manual board loading without an SSE retry loop', async () => {
  const h = browser({ live: false });
  assert.equal(await h.connect(), false);
  assert.equal(h.streams.length, 0); assert.equal(h.timers.length, 0); assert.equal(h.boards.length, 0);
  assert.equal(h.statuses.at(-1), 'Manual refresh');
});

test('scanner fetch wrapper sends each selected flight/date to regular and emergency APIs', async () => {
  const source = fs.readFileSync(path.join(root, 'flight-session.js'), 'utf8');
  const date = require('../flightContext').operationalDate();
  for (const flight of ['MU586', 'MU9586', 'MU578', 'MU9578']) {
    const requests = [];
    const location = { pathname: '/scan.html', href: 'https://www.mufcapp.net/scan.html', replace() { throw new Error('Unexpected redirect'); } };
    const window = { location, fetch: async (url, init) => requests.push({ url, init }) };
    const ctx = vm.createContext({ window, location, Intl, Date, URL, Request,
      sessionStorage: { getItem: () => JSON.stringify({ flightNo: flight, flightDate: date }) },
      document: { addEventListener() {} } });
    vm.runInContext(source, ctx);
    for (const endpoint of ['/cbs-scan', '/cbs-scan2']) {
      await window.fetch('https://api.mufcapp.net' + endpoint, { method: 'POST', body: JSON.stringify({ rawScan: 'TEST' }) });
      const request = requests.at(-1), url = new URL(request.url);
      assert.equal(url.searchParams.get('flightNo'), flight);
      assert.equal(url.searchParams.get('flightDate'), date);
      assert.equal(request.init.method, 'POST');
    }
  }
});

test('startup connection failure retries only the backend cache and closes on pagehide', async () => {
  const h = browser();
  h.ctx.fetch = async () => { throw new Error('Offline'); };
  assert.equal(await h.connect(), true);
  assert.equal(h.timers[0].delay, 10000);
  h.handlers.pagehide(); assert.equal(h.timers[0].cleared, true);
  await h.timers[0].fn(); assert.equal(h.streams.length, 0);
});

test('page scripts parse and both regular pages subscribe to the shared stream', () => {
  for (const name of ['scan.html', 'm-board.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if (match[1].trim()) new vm.Script(match[1], { filename: name });
    assert.match(html, /src="\/boarding-live\.js\?v=20261011"/);
    assert.match(html, /connectBoardingLive\(/);
  }
});

test('live board preserves entered operations, rejects older snapshots and does not scroll automatically', () => {
  const html = fs.readFileSync(path.join(root, 'm-board.html'), 'utf8');
  const extract = name => html.match(new RegExp(`    function ${name}\\([^]*?\n    }`))[0];
  const renders = [], statuses = [];
  const ctx = vm.createContext({
    renderRows: rows => renders.push(rows), setStatus: status => statuses.push(status)
  });
  vm.runInContext('let boardRevision = -1, boardMutationRunning = false, deferredBoard = null;', ctx);
  vm.runInContext(extract('applyLiveBoard') + '\n' + extract('finishBoardMutation'), ctx);
  ctx.applyLiveBoard({ revision: 1, rows: [{ bn: '014' }], backupPending: true });
  assert.equal(renders.length, 1); assert.match(statuses.at(-1), /backup pending/);
  vm.runInContext('boardMutationRunning = true;', ctx);
  ctx.applyLiveBoard({ revision: 2, rows: [{ bn: '014', entered: true }] });
  assert.equal(renders.length, 1);
  ctx.finishBoardMutation(); assert.equal(renders.at(-1)[0].entered, true);
  ctx.applyLiveBoard({ revision: 1, rows: [] }); assert.equal(renders.length, 2);
  assert.doesNotMatch(extract('applyLiveBoard'), /scrollIntoView|scrollToLatestRecord/);
});

test('M-board retains all resolved and pending NBRD rows through live and manual refresh rendering', () => {
  const html = fs.readFileSync(path.join(root, 'm-board.html'), 'utf8');
  const render = html.match(/    function renderRows\([^]*?\n    }/)[0];
  const calls = [];
  const ctx = vm.createContext({ Set,
    renderNbrdRows: rows => calls.push(rows), renderScanRows() {}, renderInfantRows() {},
    collectRecordKeys: rows => new Set(rows.map(row => row.rowNumber))
  });
  vm.runInContext('let currentRecordKeys = new Set();\n' + render, ctx);
  const rows = [
    { rowNumber: 1, nbrdBn: '004', nbrdResolved: true },
    { rowNumber: 2, nbrdBn: '154', nbrdResolved: true },
    { rowNumber: 3, bn: '004', seat: '10A', flight: 'MU586' }
  ];
  assert.equal(ctx.renderRows(rows).nbrdRows.length, 2);
  assert.ok(calls[0].every(row => row.nbrdResolved));
  rows[0].nbrdResolved = false;
  assert.equal(ctx.renderRows(rows).nbrdRows.length, 2);
  assert.equal(calls[1][0].nbrdResolved, false);
  assert.equal(ctx.renderRows([]).nbrdRows.length, 0);
  const load = html.match(/    async function loadBoard\([^]*?\n    }/)[0];
  assert.doesNotMatch(load, /!row\.nbrdResolved/);
});
