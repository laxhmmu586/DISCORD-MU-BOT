const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
const page = fs.readFileSync(path.join(__dirname, '..', 'public/public/cbs.html'), 'utf8').replace(/\r\n/g, '\n');
const functionSource = (source, name) => {
  const result = source.match(new RegExp(`^( *)(?:async )?function ${name}\\([^]*?\\n\\1\\}`, 'm'));
  assert.ok(result, `Missing ${name}`);
  return result[0];
};
const templates = vm.createContext({});
for (const name of ['cbsEmailIsChinese', 'cbsPlainTextEmailHtml', 'incorrectBaggagePickupEmail', 'baggagePickupAtLaxEmail']) {
  vm.runInContext(functionSource(server, name), templates);
}

test('incorrect pickup email preserves bilingual instructions and emphasis', () => {
  const en = templates.incorrectBaggagePickupEmail({ language:'en' });
  const zh = templates.incorrectBaggagePickupEmail({ language:'zh' });
  assert.equal(en.subject, 'Urgent: Incorrect Baggage Pick-Up');
  assert.equal(zh.subject, '紧急：误取他人行李通知');
  assert.match(en.text, /Please contact us immediately upon receiving this email/);
  assert.match(en.html, /<strong>Los Angeles International Airport \(LAX\), Tom Bradley International Terminal \(TBIT\), Counter A68<\/strong>/);
  assert.match(en.html, /<strong>Return Time: 7:00 AM – 2:00 PM<\/strong>/);
  for (const phrase of ['立即与我们取得联系', '洛杉矶国际机场（LAX）', 'Tom Bradley International Terminal（TBIT）', 'A68号柜台', '接收时间：上午7:00至下午2:00']) {
    assert.ok(zh.html.includes(`<strong>${phrase}</strong>`));
  }
  assert.ok(!en.text.includes('<strong>') && !zh.text.includes('<strong>'));
});

function routeHarness(route, records = []) {
  let handler;
  const sent = [];
  const resolutions = [];
  const context = vm.createContext({
    ...templates,
    console,
    app:{ post:(_path, fn) => { handler = fn; } },
    sendCbsCaseEmail:async (message) => { sent.push(message); return { sent:true }; },
    getCbsUnresolvedBaggageCases:async () => records,
    resolveCbsUnresolvedBaggageCase:async (...args) => { resolutions.push(args); return { record:records[0] }; },
    syncOnHandStatusToBaggage:async () => {},
    updateCbsCase:async (_id, update) => ({ record:records[0], update }),
    cbsEmailErrorMessage:(error) => error.message
  });
  for (const name of ['sanitizeCbsText', 'isValidEmail', 'buildCbsUpdateFields']) vm.runInContext(functionSource(server, name), context);
  const start = server.indexOf(`app.post('${route}'`);
  const end = server.indexOf('\n});', start) + 4;
  vm.runInContext(server.slice(start, end), context);
  const response = { statusCode:200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { handler, response, sent, resolutions };
}

test('On-hand available pickup sends its template without the deleted body editor', async () => {
  const h = routeHarness('/cbs-unresolved-baggage/:rowNumber/update', [{ rowNumber:2 }]);
  await h.handler({ params:{ rowNumber:2 }, body:{ action:'email', emailAction:'contact_pax_pickup_bags', emailTo:'passenger@example.com' } }, h.response);
  assert.equal(h.response.statusCode, 200);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].subject, templates.baggagePickupAtLaxEmail({}).subject);
});

test('standalone and On-hand wrong pickup send without a WorldTracer file or attachment', async () => {
  for (const route of ['/cbs-email', '/cbs-unresolved-baggage/:rowNumber/update']) {
    const h = routeHarness(route, [{ rowNumber:2 }]);
    await h.handler({ params:{ rowNumber:2 }, body:{ action:'email', emailAction:'pickup_wrong_bags', emailTo:'passenger@example.com', passengerEmail:'passenger@example.com', language:'zh' } }, h.response);
    assert.equal(h.response.statusCode, 200);
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].subject, '紧急：误取他人行李通知');
    assert.equal(h.sent[0].passengerEmail, 'passenger@example.com');
    assert.equal(h.sent[0].ccOperations, false);
    if (route.includes('unresolved')) assert.match(h.resolutions[0][2], /^Pick up Wrong bags/);
  }
});

test('Passenger Filed wrong pickup uses the passenger language and logs the email action', async () => {
  const h = routeHarness('/cbs-cases/:rowNumber/update', [{ rowNumber:2, email:'filed@example.com', language:'zh' }]);
  await h.handler({ params:{ rowNumber:2 }, body:{ type:'email', emailAction:'pickup_wrong_bags', updatedBy:'Agent' } }, h.response);
  assert.equal(h.response.statusCode, 200);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].subject, '紧急：误取他人行李通知');
  assert.equal(h.sent[0].passengerEmail, 'filed@example.com');
  assert.equal(h.response.body.update.updateEvent.title, 'Pick up Wrong bags');
});

const progress = vm.createContext({ inferCaseType:() => 'AHL', isClosedCase:() => false });
vm.runInContext(functionSource(page, 'orderedCaseProgressEvents'), progress);
const authorizationTitles = ['Sent authorization form to passenger', 'Sent Open Bag Authorization to PVG'];
const baseEvents = [{ key:'create' }, { key:'worldtracer' }];
test('skipped optional authorization nodes disappear after a later stage starts', () => {
  for (const later of [{ key:'requested_bags' }, { key:'email', title:'Baggage transfer status update - ETA' }, { key:'shipping' }, { key:'closed' }]) {
    const result = progress.orderedCaseProgressEvents({}, [...baseEvents, later]);
    assert.equal(result.filter((event) => authorizationTitles.includes(event.title)).length, 0);
  }
});

test('completed authorization nodes remain visible and pending nodes are available before skipping', () => {
  const pending = progress.orderedCaseProgressEvents({}, baseEvents);
  assert.equal(pending.filter((event) => event.planned && authorizationTitles.includes(event.title)).length, 2);
  for (const title of authorizationTitles) {
    const completed = { key:'email', title, at:'2026-10-03T12:00:00Z' };
    const result = progress.orderedCaseProgressEvents({}, [...baseEvents, completed, { key:'requested_bags' }]);
    assert.equal(result.filter((event) => authorizationTitles.includes(event.title)).length, 1);
    assert.ok(result.includes(completed));
  }
});
