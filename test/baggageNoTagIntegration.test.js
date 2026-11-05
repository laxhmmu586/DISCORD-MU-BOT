const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.CBS_SQLITE_PATH = ':memory:';
process.env.CBS_STORAGE = 'sqlite';
const storage = require('../cbsStorage');
const drive = require('../googleDrive');

test('No Tag API uses the real server imports and persists separate CBS On Hand records', async () => {
  const store = storage.local();
  try {
    store.importBook(storage.book, [{gid:523026916, title:'Onhand', rows:[['Bag Tag']]}]);
    const server = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const importEnd = server.indexOf("} = require('./googleDrive');") + "} = require('./googleDrive');".length;
    const importStart = server.lastIndexOf('const {', importEnd);
    const routeStart = server.indexOf("app.post('/test-baggage',");
    const routeEnd = server.indexOf('\n});', routeStart) + 4;
    let handler;
    const errors = [];
    const context = vm.createContext({
      require(name) { assert.equal(name, './googleDrive'); return drive; },
      app:{post(route, callback) { assert.equal(route, '/test-baggage'); handler = callback; }},
      BaggageGuide:require('../public/public/baggage-guide'),
      cleanBodyText:value => String(value || '').trim(),
      normalizeTestBagTag:value => String(value || '').replace(/\s/g, '').toUpperCase(),
      isValidTestBagTag:value => /^[A-Z0-9]{2}\d{6}$/.test(value),
      isValidRushBagTag:() => true,
      console:{error(...args) { errors.push(args); }}
    });
    // Keep the production import binding: injecting a writer stub hid this regression.
    vm.runInContext(server.slice(importStart, importEnd), context);
    vm.runInContext(server.slice(routeStart, routeEnd), context);
    const identification = {color:'BE', type:'25', descriptors:'X-M,K'};
    const submit = async bagIdentification => {
      let status = 200, body;
      await handler({body:{noTag:true, direction:'inbound', bagTag:'No Tag',
        date:'2026-11-05', flight:'MU583', bagType:'Passenger bag', location:'Office',
        submittedBy:'fixture@example.com', bagIdentification}}, {
        status(value) { status = value; return this; },
        json(value) { body = value; return this; }
      });
      assert.equal(status, 201, JSON.stringify(body));
      assert.equal(body.created, true);
      return body.record;
    };
    const saved = await Promise.all([submit(identification), submit({})]);
    assert.deepEqual(errors, []);
    assert.notEqual(saved[0].rowNumber, saved[1].rowNumber);
    const rows = await drive.getCbsUnresolvedBaggageCases({forceRefresh:true});
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.bagTag, 'No Tag');
      assert.equal(row.flightNumber, 'MU583');
      assert.equal(row.flightDate, '2026-11-05');
      assert.equal(row.location, 'Office');
    }
    assert.deepEqual(rows.find(row => row.rowNumber === saved[0].rowNumber).bagIdentifications[0],
      {number:1, tag:'No Tag', ...identification});
    assert.equal(store.db.inTransaction, false);
  } finally {
    store.db.close();
  }
});
