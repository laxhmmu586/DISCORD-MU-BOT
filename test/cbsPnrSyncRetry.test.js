const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const server = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../public/public/cbs.html'), 'utf8');
function pageFunction(name) {
  const start = page.indexOf(`    async function ${name}(`);
  return page.slice(start, page.indexOf('\n    }', start) + 6);
}

function routeContext(results) {
  let handler;
  let scans = 0;
  const context = vm.createContext({
    app:{ post:(_path, callback) => { handler = callback; } },
    sanitizeCbsText:(value) => value || '',
    getCbsCases:async () => [], getCbsUnresolvedBaggageCases:async () => [],
    startCbsPnrRecordSync:async () => { scans++; return results.shift(); },
    console, Date
  });
  const start = server.indexOf("app.post('/cbs-record-sync'");
  vm.runInContext('let cbsPnrSyncRecent = { at:0, result:null };\n' + server.slice(start, server.indexOf('\n});', start) + 4), context);
  return {
    scans:() => scans,
    request:async (forceRefresh = false) => {
      let response;
      await handler({ body:{ forceRefresh } }, { json:(value) => { response = value; }, status:() => { throw new Error('Unexpected route error'); } });
      return response;
    }
  };
}

test('a record uploaded after a miss is retried without waiting five minutes', async () => {
  const route = routeContext([
    { checked:1, updated:0, errors:[] },
    { checked:1, updated:1, errors:[] }
  ]);
  assert.equal((await route.request()).updated, 0);
  assert.equal((await route.request()).updated, 1);
  assert.equal(route.scans(), 2);
  assert.equal((await route.request()).skipped, true);
  assert.equal(route.scans(), 2);
});

test('partial failures retry and a forced refresh bypasses a successful sync cache', async () => {
  const route = routeContext([
    { checked:2, updated:1, errors:[{ error:'temporary write failure' }] },
    { checked:1, updated:1, errors:[] },
    { checked:1, updated:1, errors:[] }
  ]);
  await route.request();
  assert.equal((await route.request()).skipped, undefined);
  assert.equal((await route.request(true)).skipped, undefined);
  assert.equal(route.scans(), 3);
});

test('unchanged passenger rows still trigger an archive sync on refresh', async () => {
  let syncs = 0;
  const rows = [{ rowNumber:2, bagTag:'MU000001' }];
  const context = vm.createContext({
    window:{ _silentCbsRefresh:true, _cbsRowsSignature:JSON.stringify(rows), _forceCbsRefresh:true },
    casesOutput:{}, apiBase:'https://example.invalid',
    fetch:async () => ({ ok:true }), parseJson:async () => ({ rows }),
    syncCbsPnrRecords:() => { syncs++; },
    renderCases:() => { throw new Error('Unchanged rows should not render'); }, console
  });
  vm.runInContext(pageFunction('loadCases'), context);
  await context.loadCases();
  assert.equal(syncs, 1);
});

test('forceRefresh is captured before asynchronous updater lookup finishes', async () => {
  let releaseUpdater;
  let payload;
  const context = vm.createContext({
    window:{ _forceCbsRefresh:true }, apiBase:'https://example.invalid',
    currentUpdater:() => new Promise((resolve) => { releaseUpdater = resolve; }),
    fetch:async (_url, options) => { payload = JSON.parse(options.body); return { ok:true }; },
    parseJson:async () => ({ updated:0 }), console
  });
  vm.runInContext(pageFunction('syncCbsPnrRecords'), context);
  const pending = context.syncCbsPnrRecords();
  context.window._forceCbsRefresh = false;
  releaseUpdater('System');
  await pending;
  assert.equal(payload.forceRefresh, true);
  assert.equal(context.window._cbsPnrSyncPending, null);
});
