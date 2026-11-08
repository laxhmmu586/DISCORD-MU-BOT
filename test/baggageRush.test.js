const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { createApiGuard, captureBody } = require('../desktopProtection');
const { findLinkedRushBagRecords } = require('../rushBagNotification');

const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8').replace(/\r\n/g, '\n');
function functionSource(name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?\\n\\}`, 'm'));
  assert.ok(match, name);
  return match[0];
}
const payload = () => ({
  worldTracerFileNumber:'', originalTagNumber:'DL123456', rushTagNumber:'MU654321',
  flightRows:[{ flightDate:'2026-11-08', flightNumber:'MU586', from:'LAX', to:'PVG' },
    { flightDate:'2026-11-09', flightNumber:'MU5101', from:'PVG', to:'PEK' }]
});

async function fixture(t) {
  const app = express(), records = [], messages = [];
  let failDiscord = false;
  app.use(express.json({ verify:captureBody }));
  app.use(createApiGuard({ authenticate:async req => {
    if (req.get('Authorization') !== 'Bearer employee') throw Error('login');
    return { uid:'employee', email:'fixture@example.test' };
  } }));
  const context = vm.createContext({
    app, console:{ error() {} }, findLinkedRushBagRecords,
    sanitizeSheetText:(value, max) => String(value || '').trim().slice(0, max),
    CBS_RUSH_BAG_DISCORD_CHANNEL_ID:'fixture-rush-channel',
    client:{ channels:{ fetch:async id => {
      assert.equal(id, 'fixture-rush-channel');
      return { isTextBased:() => true, send:async message => {
        if (failDiscord) throw Error('Discord unavailable');
        messages.push(message);
      } };
    } } },
    getCbsWorldTracerCases:async () => records,
    appendCbsWorldTracerCase:async record => {
      const saved = { ...record, rowNumbers:[records.length + 1] };
      records.push(saved);
      return saved;
    },
    updateCbsWorldTracerCase:async (rowNumbers, record) => {
      const saved = records.find(row => row.rowNumbers[0] === rowNumbers[0]);
      Object.assign(saved, record);
      return { record:saved };
    },
    matchBagRoomUnloadCasesForRush:async () => []
  });
  vm.runInContext('let rushBagWriteQueue = Promise.resolve();', context);
  for (const name of ['sanitizeCbsText', 'isValidRushBagTag', 'sendRushBagToDiscord', 'addRushBagDiscordResult',
    'addDuplicateRushBagDiscordResult', 'withRushBagWriteLock', 'saveLinkedRushBag']) {
    vm.runInContext(functionSource(name), context);
  }
  const start = source.indexOf("app.post('/cbs-worldtracer-cases',");
  assert(start > 0);
  vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), context);
  app.use((_req, res) => res.json({ ok:true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (body, token = 'employee') => fetch(base + '/cbs-worldtracer-cases', {
    method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token },
    body:JSON.stringify(body)
  });
  return { base, post, records, messages, failDiscord:() => { failDiscord = true; } };
}

test('web Rush Bag uses the CBS save and Discord pipeline, and linked submissions do not duplicate records or notices', async t => {
  const h = await fixture(t);
  const response = await h.post(payload());
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.discord.sent, true);
  assert.equal(h.records.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.records[0].flightRows)), payload().flightRows);
  assert.equal(h.records[0].worldTracerFileNumber, '');
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0].content, /Original Tag Number: DL123456/);
  assert.match(h.messages[0].content, /RUSH Tag Number: MU654321/);
  assert.match(h.messages[0].content, /MU5101 \| PVG → PEK/);
  const second = await h.post({ ...payload(), worldTracerFileNumber:' laxmu12345 ' });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).updated, true);
  assert.equal(h.records.length, 1);
  assert.equal(h.records[0].worldTracerFileNumber, 'LAXMU12345');
  assert.equal(h.messages.length, 1);
});

test('Rush Bag rejects anonymous and invalid submissions before storage or notification', async t => {
  const h = await fixture(t);
  assert.equal((await h.post(payload(), '')).status, 401);
  assert.equal((await h.post(payload(), 'invalid')).status, 401);
  for (const body of [{ ...payload(), originalTagNumber:'bad' }, { ...payload(), rushTagNumber:'' },
    { ...payload(), flightRows:[] }, { ...payload(), flightRows:[{ ...payload().flightRows[0], to:'' }] }]) {
    assert.equal((await h.post(body)).status, 400);
  }
  assert.equal(h.records.length, 0);
  assert.equal(h.messages.length, 0);
});

test('CBS reports a saved case separately from Discord failure', async t => {
  const h = await fixture(t);
  h.failDiscord();
  const response = await h.post(payload());
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.created, true);
  assert.equal(result.discordError, 'Discord unavailable');
  assert.equal(h.records.length, 1);
});

test('Rush creation permission does not expose CBS lists, editing or other desktop APIs', async t => {
  const h = await fixture(t);
  for (const [method, route] of [['GET', '/cbs-worldtracer-cases'], ['POST', '/cbs-worldtracer-cases/update'],
    ['DELETE', '/cbs-worldtracer-cases'], ['GET', '/cbs-cases'], ['GET', '/search?q=SY']]) {
    assert.equal((await fetch(h.base + route, { method, headers:{ Authorization:'Bearer employee' } })).status, 403, route);
  }
});
