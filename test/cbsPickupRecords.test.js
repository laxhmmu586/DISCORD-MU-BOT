const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const page = fs.readFileSync(path.join(__dirname, '../public/public/cbs.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
function functionSource(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n}', start);
  const htmlEnd = source === page ? source.indexOf('\n    }', start) : -1;
  return source.slice(start, htmlEnd >= 0 && (end < 0 || htmlEnd < end) ? htmlEnd + 6 : end + 2);
}
const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ui = vm.createContext({ escapeHtml, label:(en) => en, updaterDisplayName:(name) => name, rushBagTagInputAttributes:'' });
for (const name of ['recordTabsHtml', 'recordTextareaHtml', 'inlineUpdateFieldsHtml', 'unresolvedUpdateFieldsHtml', 'resolutionOptionsHtml']) vm.runInContext(functionSource(page, name), ui);

test('AHL/DPR and OHL always expose both record tabs, including empty cases', () => {
  for (const key of ['passenger-2', 'passenger-3', 'unresolved-4']) {
    const html = ui.recordTabsHtml([], key);
    assert.match(html, /Record - PNR/);
    assert.match(html, /Record - TKT/);
    assert.match(html, /No saved record yet/);
    assert.doesNotMatch(html, /disabled/);
  }
});
test('saved records preserve layout, escape HTML, and show the newest snapshot', () => {
  const html = ui.recordTabsHtml([
    { key:'record', fields:[['Record', 'old']] },
    { key:'record-pnr', fields:[['Record - PNR', 'PNR  EXAMPLE\n  <BAG>']] },
    { key:'record-tkt', fields:[['Record - TKT', 'TKT  EXAMPLE']] }
  ], 'passenger-2');
  assert.match(html, /PNR  EXAMPLE\n  &lt;BAG&gt;/);
  assert.match(html, /TKT  EXAMPLE/);
  assert.doesNotMatch(html, />old</);
});
test('airport pickup is a peer action and reuses existing shipping closure payloads', () => {
  const stages = page.slice(page.indexOf('const TRACKING_STAGES'), page.indexOf('function parseStoredUpdateEvents'));
  assert.match(stages, /key:'airport_pickup', text:'Pick up at airport'/);
  const passenger = ui.inlineUpdateFieldsHtml('airport_pickup');
  assert.match(passenger, /name="type" value="shipping"/);
  assert.match(passenger, /name="shippingMethod" value="Pick Up at Airport"/);
  const onHand = ui.unresolvedUpdateFieldsHtml('airport-pickup', 'MU000001');
  assert.match(onHand, /name="action" value="shipped"/);
  assert.match(onHand, /name="shippingMethod" value="Pick Up at Airport"/);
  assert.match(ui.resolutionOptionsHtml(false), /value="shipped">Shipping<\/option><option value="airport-pickup">Pick up at airport/);
  for (const html of [ui.inlineUpdateFieldsHtml('shipping'), ui.unresolvedUpdateFieldsHtml('shipped', 'MU000001')]) {
    assert.doesNotMatch(html, /<option>Pick Up at Airport/);
  }
});
function syncContext(overrides = {}) {
  const context = vm.createContext({ console:{ error() {} }, pnrRecordMatchesFlight:require('../cbsRecordParser').pnrRecordMatchesFlight, ...overrides });
  for (const name of ['monthNameToNumber', 'normalizeRecordCheckBagTag', 'cbsRecordLookupDate', 'cbsArrivalRecordScope', 'casePnrRecord', 'caseNeedsPnrSync', 'caseNeedsArrivalPnrSync', 'bestCbsPnrRecord', 'syncMissingCbsPnrRecords']) vm.runInContext(functionSource(server, name), context);
  vm.runInContext("const CBS_BAG_TAG_AIRLINES = { '781':'MU' };", context);
  return context;
}
test('PNR archive lookup uses flight dates instead of later report dates', () => {
  const context = syncContext();
  assert.equal(context.cbsRecordLookupDate({ flightRoute:'MU583 08OCT PVG LAX', issueDate:'2026-10-12' }), '2026-10-08');
  assert.equal(context.cbsRecordLookupDate({ originalFormData:JSON.stringify({ flightRows:[{ flightDate:'08OCT' }] }), issueDate:'2026-10-12' }), '2026-10-08');
  assert.equal(context.cbsRecordLookupDate({ flightDate:'2026-10-08', submittedAt:'2026-10-12' }), '2026-10-08');
  assert.equal(context.cbsRecordLookupDate({ flightDate:'31DEC', issueDate:'2026-01-02' }), '2025-12-31');
  assert.equal(context.cbsRecordLookupDate({ flightDate:'31FEB26', issueDate:'2026-03-01' }), '2026-03-01');
});
test('AHL, DPR and OHL import PNR/TKT from the same log lookup as Bag Room', async () => {
  const lookups = [], passengerWrites = [], unresolvedWrites = [];
  const context = syncContext({
    findCbsPnrRecordsByBagTag:async (tag, date, flights) => {
      lookups.push([tag, date, Array.from(flights)]);
      return { records:tag === '000001' ? [] : [{ content:'PNR EXAMPLE\n  BAG2', ticketContent:'TKT EXAMPLE' }] };
    },
    updateCbsCase:async (row, update) => { passengerWrites.push([row, update]); return {}; },
    updateCbsUnresolvedBaggageDetails:async (row, update) => { unresolvedWrites.push([row, update]); return {}; }
  });
  const result = await context.syncMissingCbsPnrRecords([
    { rowNumber:2, caseType:'AHL', bagTag:'MU000001 / MU000002', flightRoute:'MU583 08OCT PVG LAX', issueDate:'2026-10-12', status:'WorldTracer' },
    { rowNumber:3, caseType:'DPR', bagTag:'MU000002', flightRoute:'MU583 08OCT PVG LAX', issueDate:'2026-10-12', status:'Closed' }
  ], [
    { rowNumber:4, caseType:'OHL', bagTag:'0781000002', flightDate:'2026-10-08' },
    { rowNumber:5, caseType:'Bag Room', bagType:'Not Load Bags', bagTag:'MU000002', flightDate:'2026-10-08' }
  ]);
  assert.equal(result.updated, 4);
  assert.deepEqual(lookups, [['000001', '2026-10-08', ['MU583']], ['000002', '2026-10-08', ['MU583']], ['000002', '2026-10-08', ['MU583', 'MU577']], ['000002', '2026-10-08', []]]);
  assert.equal(passengerWrites.length, 4);
  assert.equal(unresolvedWrites.length, 4);
  assert.equal(passengerWrites[0][1].updateEvent.key, 'record-pnr');
  assert.equal(passengerWrites[0][1].status, 'WorldTracer');
  assert.equal(passengerWrites[1][1].updateEvent.key, 'record-tkt');
  assert.equal(unresolvedWrites[0][1].recordType, 'pnr');
});
test('existing manually saved PNR records are preserved and misses retry later', async () => {
  let available = false, writes = 0;
  const context = syncContext({
    findCbsPnrRecordsByBagTag:async () => ({ records:available ? [{ content:'PNR EXAMPLE' }] : [] }),
    updateCbsCase:async () => { writes++; return {}; }
  });
  const row = { rowNumber:2, bagTag:'MU000001', flightDate:'2026-10-08' };
  assert.equal((await context.syncMissingCbsPnrRecords([row])).updated, 0);
  available = true;
  assert.equal((await context.syncMissingCbsPnrRecords([row])).updated, 1);
  row.updateEvents = [{ key:'record-pnr', fields:[['Record - PNR', 'MANUAL RECORD']] }];
  assert.equal((await context.syncMissingCbsPnrRecords([row])).checked, 0);
  assert.equal(writes, 1);
});

test('standalone airport pickup keeps the existing close event and pickup email trigger', () => {
  const context = vm.createContext({ sanitizeCbsText:(value, max) => String(value || '').trim().slice(0, max) });
  vm.runInContext(functionSource(server, 'buildCbsUpdateFields'), context);
  const update = context.buildCbsUpdateFields({ type:'shipping', shippingMethod:'Pick Up at Airport', comment:'Collected' });
  assert.equal(update.status, 'Closed - Pick Up at Airport');
  assert.equal(update.updateEvent.key, 'shipping');
  assert.equal(update.followUpEvent.key, 'closed');
  assert.equal(new Map(update.updateEvent.fields).get('Shipping Method'), 'Pick Up at Airport');
  assert.match(server, /updateFields\.updateEvent\?\.key === 'shipping' && updateFields\.updateEvent\.fields\.some\(\(\[key, value\]\) => key === 'Shipping Method' && value === 'Pick Up at Airport'\)/);
});

test('arrival scope chooses MU583/MU577 dates instead of connecting flights', () => {
  const context = syncContext();
  assert.equal(context.cbsArrivalRecordScope({ flightRoute:'MU583 10OCT PVG LAX / MU5326 09OCT CAN PVG', issueDate:'2026-10-12' }).date, '2026-10-10');
  const scope = context.cbsArrivalRecordScope({ flightRows:[{ flightNo:'MU577', flightDate:'11OCT' }, { flightNo:'MU123', flightDate:'09OCT' }], issueDate:'2026-10-12' });
  assert.equal(scope.date, '2026-10-11');
  assert.deepEqual(Array.from(scope.flightNumbers), ['MU577']);
  assert.equal(context.caseNeedsArrivalPnrSync({ flightRoute:'MU583 10OCT PVG LAX', issueDate:'2026-10-12', updateEvents:[{ key:'record-pnr', fields:[['Record - PNR', 'PR: MU586/10OCT26*LAX\nBAGTAG/MU000001']] }] }), true);
});
test('closed OHL still imports arrival records while closed Bag Room is excluded', async () => {
  const scopes = [];
  const context = syncContext({
    findCbsPnrRecordsByBagTag:async (tag, date, flights) => { scopes.push(Array.from(flights)); return { records:[{ content:'PR: MU577/10OCT26*LAX\nBAGTAG/MU000001', ticketContent:'TKT EXAMPLE' }] }; },
    updateCbsUnresolvedBaggageDetails:async () => ({})
  });
  const result = await context.syncMissingCbsPnrRecords([], [
    { rowNumber:4, bagTag:'MU000001', flightNumber:'MU577', flightDate:'2026-10-10', resolvedAt:'2026-10-12' },
    { rowNumber:5, bagTag:'MU000001', bagType:'Not Load Bags', flightDate:'2026-10-10', resolvedAt:'2026-10-12' }
  ]);
  assert.equal(result.updated, 1);
  assert.deepEqual(scopes, [['MU577']]);
});

test('Drive lookup imports only the matching arrival PNR/TKT from mixed-flight logs', async () => {
  const driveSource = fs.readFileSync(path.join(__dirname, '../googleDrive.js'), 'utf8');
  const parser = require('../cbsRecordParser');
  const log = ['PR: MU586/12OCT26*LAX\nBAGTAG/MU000001\nI/TEST', 'PR: MU583/11OCT26*PVG\nBAGTAG/MU000001\nI/TEST', 'PR: MU583/12OCT26*PVG\nBAGTAG/MU000001\nI/TEST\n2026 October 12, Monday, 09:00:00\n>ETKD\nTKT EXAMPLE'].join('\n');
  const context = vm.createContext({
    ...parser, console:{ warn() {} }, CBS_RECORD_TODAY_FOLDER_ID:'today',
    cbsRecordDateKeys:() => ['12OCT26'], findCbsRecordDateFolders:async () => [],
    listDriveDescendantFiles:async () => [{ id:'log', name:'mixed.txt' }, { id:'filename-only', name:'000001.txt' }],
    readCbsRecordFile:async (file) => file.id === 'log' ? log : 'PR: MU586/12OCT26*LAX\nBAGTAG/MU999999'
  });
  vm.runInContext(functionSource(driveSource, 'findCbsPnrRecordsByBagTag'), context);
  const result = await context.findCbsPnrRecordsByBagTag('000001', '2026-10-12', ['MU583', 'MU577']);
  assert.equal(result.records.length, 1);
  assert.match(result.records[0].content, /PR: MU583\/12OCT26/);
  assert.match(result.records[0].ticketContent, /TKT EXAMPLE/);
});

test('Drive arrival lookup accepts the supplied pr1pd date/station suffix', async () => {
  const driveSource = fs.readFileSync(path.join(__dirname, '../googleDrive.js'), 'utf8');
  const parser = require('../cbsRecordParser');
  const context = vm.createContext({
    ...parser, console:{ warn() {} }, CBS_RECORD_TODAY_FOLDER_ID:'today',
    cbsRecordDateKeys:() => ['12OCT26'], findCbsRecordDateFolders:async () => [],
    listDriveDescendantFiles:async () => [{ id:'log', name:'arrival.txt' }],
    readCbsRecordFile:async () => '2026 October 12, Monday, 15:19:19\n>pr1pd\n PR: MU583/12OCT26IPVG,1PD          PNR RL  SAMPLE\n     BAGTAG/3781820272/LAX /3781111492/LAX\n      I/MU5326/12OCT\n     RES AUTO 11OCT1310 +'
  });
  vm.runInContext(functionSource(driveSource, 'findCbsPnrRecordsByBagTag'), context);
  const result = await context.findCbsPnrRecordsByBagTag('111492', '2026-10-12', ['MU583']);
  assert.equal(result.records.length, 1);
  assert.match(result.records[0].content, /MU583\/12OCT26IPVG,1PD/);
  assert.match(result.records[0].content, /3781111492\/LAX/);
});
