const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../googleDrive.js'), 'utf8');
function functionSource(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
function storageContext(initialEvents = []) {
  let history = JSON.stringify(initialEvents);
  let writes = 0;
  const context = vm.createContext({
    sanitizeSheetText:(value, max) => String(value || '').trim().slice(0, max),
    sanitizeSheetMultilineText:(value, max) => String(value || '').trim().slice(0, max),
    cbsRecordMatchesId:(row, id) => String(row.rowNumber) === String(id),
    cbsValuesFromRecord:(row) => [row.updateHistory],
    getCbsSheetTitle:async () => 'Cases', escapeSheetTitle:(value) => value,
    CBS_SHEET_ID:'test-sheet', cbsSheetCache:{ loadedAt:123 },
    sheets:{ spreadsheets:{ values:{ update:async (request) => {
      assert.equal(request.range, 'Cases!A31:AM31');
      history = request.requestBody.values[0][0];
      writes++;
    } } } },
    getCbsCases:async () => [{ rowNumber:31, caseType:'DPR', status:'WorldTracer', updateHistory:history }]
  });
  for (const name of ['sanitizeCbsUpdateEvent', 'parseCbsUpdateHistory', 'stringifyCbsUpdateHistory', 'cbsEventsFromUpdateNote', 'updateCbsCase']) {
    vm.runInContext(functionSource(name), context);
  }
  return { context, read:() => context.parseCbsUpdateHistory(history), writes:() => writes };
}

test('automatic PNR and TKT events survive a sheet write/read without updateNote', async () => {
  const storage = storageContext([{ key:'worldtracer', fields:[['File Number', 'TEST']], status:'WorldTracer' }]);
  const pnr = 'PR: MU583/12OCT26IPVG,1PD PNR RL SAMPLE\nBAGTAG/3781820272/LAX /3781111492/LAX\n I/MU5326/12OCT';
  for (const [type, record] of [['pnr', pnr], ['tkt', 'TKT SAMPLE\nTEST/PASSENGER']]) {
    const result = await storage.context.updateCbsCase(31, {
      status:'WorldTracer', replaceEventKey:`record-${type}`,
      updateEvent:{ key:`record-${type}`, fields:[[`Record - ${type.toUpperCase()}`, record]], by:'System' }
    });
    assert.equal(result.updated, true);
    assert.equal(result.record.status, 'WorldTracer');
    const saved = storage.read().find((event) => event.key === `record-${type}`);
    assert.equal(new Map(saved.fields).get(`Record - ${type.toUpperCase()}`), record);
  }
  assert.equal(storage.read().length, 3);
  assert.equal(storage.writes(), 2);
  assert.equal(storage.context.cbsSheetCache.loadedAt, 0);
});

test('a note-free record replacement keeps one snapshot and preserves other events', async () => {
  const storage = storageContext([
    { key:'worldtracer', fields:[['File Number', 'TEST']] },
    { key:'record-pnr', fields:[['Record - PNR', 'OLD PNR']] },
    { key:'record-tkt', fields:[['Record - TKT', 'TKT SAMPLE']] }
  ]);
  await storage.context.updateCbsCase(31, { replaceEventKey:'record-pnr', updateEvent:{ key:'record-pnr', fields:[['Record - PNR', 'NEW PNR']] } });
  const events = storage.read();
  assert.equal(events.filter((event) => event.key === 'record-pnr').length, 1);
  assert.equal(new Map(events.find((event) => event.key === 'record-pnr').fields).get('Record - PNR'), 'NEW PNR');
  assert.equal(events.length, 3);
});

test('status-only writes and event deletions do not append an empty event', async () => {
  const storage = storageContext([{ key:'record-pnr', fields:[['Record - PNR', 'PNR SAMPLE']] }]);
  await storage.context.updateCbsCase(31, { status:'Open' });
  assert.equal(storage.read().length, 1);
  await storage.context.updateCbsCase(31, { deleteEventKey:'record-pnr' });
  assert.equal(storage.read().length, 0);
});
