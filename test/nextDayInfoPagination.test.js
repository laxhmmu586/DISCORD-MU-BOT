const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { findSYInfo } = require('../syParser');

const fixture = fs.readFileSync(require.resolve('./fixtures/jcsy-05nov26.log'), 'utf8');
const secondPage = fixture.indexOf('2026 November 04, Wednesday, 04:25:52');
const thirdPage = fixture.indexOf('2026 November 04, Wednesday, 04:25:54');
const server = fs.readFileSync(require.resolve('../index.js'), 'utf8');
const helpers = server.slice(server.indexOf('function retCountsFromSyInfo('), server.indexOf('function splitReportSections('));
const route = server.slice(server.indexOf("app.post('/nextday-info/send'"), server.indexOf("app.post('/send',"));

const parse = (log) => findSYInfo(log, '05NOV', { preferredFlightNo: 'MU586', strictPreferredFlight: true });

async function send(log, requestBody = {}, desktopUser = null) {
  let handler;
  let status = 200;
  let body;
  const deliveries = [];
  const context = {
    app: { post: (_path, callback) => { handler = callback; } },
    getLatestFlightLog: async () => {if(log instanceof Error)throw log;return log;},
    require: (name) => {if(name!=='./terminalNextDay')throw Error(name);return require('../terminalNextDay');},
    findSYInfo,
    todayIsoUtc: () => '2026-11-04',
    addIsoDays: () => '2026-11-05',
    isoDateToEmailSubjectDate: () => 'Nov-05',
    isoDateToSyDate: () => '05NOV',
    sendNextDayInfoEmail: async (message) => { deliveries.push(message.text); return { id: 'test-only' }; },
    sendNextDayInfoToDiscord: async (text) => { deliveries.push(text); return { sent: true }; },
    settleWithin: (promise) => promise,
    deliveryError: (result) => result.status === 'rejected' ? 'Failed' : '',
    flightModules: { remember() {} },
    console,
  };
  vm.runInNewContext(helpers + route, context);
  await handler({ desktopUser, body: { flightNo: 'MU586', ...requestBody } }, {
    status(code) { status = code; return this; },
    json(value) { body = value; return this; },
  });
  return { status, body, deliveries };
}

test('the supplied three-page November 5 report sends 47 / 92 / 31 after reconciling 170 passengers', async () => {
  const info = parse(fixture);
  assert.equal(info.jcsy.rows.length, 45);
  assert.equal(info.jcsy.paginationComplete, true);
  assert.deepEqual(info.jcsy.parsedBookedTotal, { first: 0, business: 9, economy: 161, total: 170 });
  const result = await send(fixture);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.body.details)), {
    firstClass: '5', businessClass: '52', economyClass: '251',
    internationalTransfer: '47', domesticTransfer: '92', overnightPassengers: '31',
  });
  assert.equal(result.deliveries.length, 2);
  for (const text of result.deliveries) {
    assert.match(text, /Domestic Transfer:  92/);
    assert.match(text, /Overnight passengers:  31/);
  }
});

test('a first-page snapshot reproduces 47 / 27 / 24 but cannot send email or Discord', async () => {
  const log = fixture.slice(0, secondPage);
  const info = parse(log);
  assert.equal(info.jcsy.international, 47);
  assert.equal(info.jcsy.domestic, 27);
  assert.equal(info.jcsy.groups.overnight.reduce((sum, row) => sum + row.total, 0), 24);
  assert.equal(info.jcsy.complete, true); // Still available for partial dashboard preview.
  assert.equal(info.jcsy.paginationComplete, false);
  const result = await send(log);
  assert.equal(result.status, 400);
  assert.match(result.body.error, /final ##TOTAL## page has not been read/);
  assert.deepEqual(result.deliveries, []);
});

test('a missing middle page is rejected even when the final TOTAL footer is present', async () => {
  const result = await send(fixture.slice(0, secondPage) + fixture.slice(thirdPage));
  assert.equal(result.status, 400);
  assert.match(result.body.error, /Read 102 of 170/);
  assert.deepEqual(result.deliveries, []);
});

test('equal passenger totals cannot hide a missing cabin count', async () => {
  const log = fixture.replace('00/02/000', '00/01/001');
  const info = parse(log);
  assert.equal(info.jcsy.parsedBookedTotal.total, 170);
  assert.equal(info.jcsy.paginationComplete, false);
  const result = await send(log);
  assert.equal(result.status, 400);
  assert.deepEqual(result.deliveries, []);
});

test('a repeated final page is deduplicated before checking TOTAL', async () => {
  const log = fixture + '\n' + fixture.slice(thirdPage);
  assert.equal(parse(log).jcsy.paginationComplete, true);
  assert.equal((await send(log)).body.details.domesticTransfer, '92');
});

test('a newer incomplete JCSY query does not send stale totals from an earlier complete query', async () => {
  const log = fixture + '\n' + fixture.slice(fixture.indexOf('2026 November 04, Wednesday, 04:25:50'), secondPage)
    .replace('04:25:50', '06:30:00');
  const result = await send(log);
  assert.equal(result.status, 400);
  assert.deepEqual(result.deliveries, []);
});

function terminalPayload(){const sy=parse(fixture);return {flightNo:sy.flightNo,flightDate:'05NOV26',reservationTicketed:['',...sy.reservationTicketed.slice(1,4).map(Number)],jcsy:sy.jcsy};}
test('signed desktop aggregates use full flight date and skip cloud log',async()=>{const result=await send(Error('cloud offline'),{terminalSy:terminalPayload()},{email:'fixture@example.test'});assert.equal(result.status,200);assert.equal(result.body.details.domesticTransfer,'92');});
test('wrong year, wrong flight, missing pages and invalid totals block delivery',async()=>{for(const change of [p=>p.flightDate='05NOV25',p=>p.flightNo='MU578',p=>p.jcsy.paginationComplete=false,p=>p.reservationTicketed[1]=-1,p=>p.jcsy.rows=[null]]){const terminalSy=terminalPayload();change(terminalSy);const result=await send(Error('must not read cloud'),{terminalSy},{email:'fixture@example.test'});assert.equal(result.status,400);assert.equal(result.deliveries.length,0);}});
test('web requests cannot substitute desktop figures',async()=>{const result=await send('',{terminalSy:terminalPayload()});assert.equal(result.status,400);assert.equal(result.deliveries.length,0);});
