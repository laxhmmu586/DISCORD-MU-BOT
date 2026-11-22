const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const html = fs.readFileSync(process.env.MUFC_EXCEPTION_HTML || require.resolve('../public/public/index.html'), 'utf8');
function source(name) {
  const match = new RegExp(`      (?:async )?function ${name}\\(`).exec(html);
  assert.ok(match, name);
  return html.slice(match.index).split(/\n      (?:async )?function /)[0];
}
function setup() {
  const { document } = parseHTML(html);
  const saved = {};
  const c = { document, console, currentWarningAckMap: {}, currentUserName: () => 'Operator',
    currentSy: { flightNo: 'MU586', flightDate: '18NOV26', bnAudit: [], govAqq: {},
      reservationTicketed: [0, 0, 2], spml: { email: { found: true, counts: { VGML: 2 } }, preorderByCabin: { Y: { VGML: 1 } } } },
    normalizedBn: bn => String(bn || '').replace(/^BN/i, '').padStart(3, '0'),
    passengerName: row => row.name || '',
    allPassengerRecords: sy => sy.records || [],
    duplicateNameRows: sy => sy.names || [], duplicateBagRows: sy => sy.bags || [],
    renderMealOrderColumns: () => document.querySelector('#reservation-table-today').classList.add('has-shortage'),
    securityReviewPassBnSet: () => new Set(), govWrongPassportBnList: () => [], webEdiIssueBnList: () => [],
    unresolvedReviewedBnCount: rows => (rows || []).length,
    setBadgeText() {}, setActionIssueState() {}, rememberCompletedSyNode() {}, rerenderActiveRealtimePanel() {},
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
    apiJson: async (url, options) => {
      const data = JSON.parse(options.body);
      const key = `${data.flightNo}/${data.flightDate}/${data.warningKey}`;
      saved[key] = [{ by: data.reviewer, at: '2026-11-18T20:00:00Z' }];
      return { acknowledgements: saved[key] };
    } };
  vm.createContext(c);
  vm.runInContext(['exceptionKey', 'exceptionAcknowledged', 'exceptionAckControl', 'duplicateExceptionGroups',
    'passportExceptionKey', 'unresolvedDuplicatePassports', 'mealExceptionKey', 'applyExceptionAcknowledgementState',
    'handleExceptionAcknowledgement', 'userHasAcknowledged', 'warningAckKey', 'acknowledgeWarning',
    'updateOperationReviewNodesFromRows'].map(source).join('\n'), c);
  const click = async key => {
    const button = document.createElement('button'); button.dataset.exceptionAck = key;
    await c.handleExceptionAcknowledgement({ target: { closest: () => button } });
    return button;
  };
  return { c, document, saved, click, node: key => document.querySelector(`.node[data-key="${key}"]`) };
}
test('offload meal difference acknowledges persistently and new counts reopen it', async () => {
  const { c, document, click, node, saved } = setup();
  c.applyExceptionAcknowledgementState();
  assert.equal(node('MEAL_ORDER').dataset.status, 'issue');
  const key = c.mealExceptionKey(); await click(key);
  assert.equal(node('MEAL_ORDER').dataset.time, 'ACK');
  assert.match(document.querySelector('#meal-exception-ack').textContent, /Acknowledged by Operator/);
  c.currentWarningAckMap = { [key]: Object.values(saved)[0] }; c.applyExceptionAcknowledgementState();
  assert.equal(node('MEAL_ORDER').dataset.status, 'done');
  c.currentSy.spml.preorderByCabin.Y.VGML = 0; c.applyExceptionAcknowledgementState();
  assert.equal(node('MEAL_ORDER').dataset.status, 'issue');
});
test('same names and duplicate bags are acknowledged per group; changed identity reopens', async () => {
  const { c, click, node } = setup();
  const rows = [{ bn: '001', name: 'TEST/NAME', passportNo: 'P111111', nameKey: 'TEST/NAME', bagKey: '1234567' },
    { bn: '002', name: 'TEST/NAME', passportNo: 'P222222', nameKey: 'TEST/NAME', bagKey: '1234567' }];
  c.currentSy.names = rows; c.currentSy.bags = rows;
  for (const [type, field] of [['DUP_NAME', 'nameKey'], ['DUP_BAG', 'bagKey']]) {
    const key = c.duplicateExceptionGroups(type, rows, field)[0].key;
    assert.equal(key, c.duplicateExceptionGroups(type, [...rows].reverse(), field)[0].key);
    await click(key); assert.equal(node(type).dataset.time, 'ACK');
  }
  rows[1].passportNo = 'P333333'; c.applyExceptionAcknowledgementState();
  assert.equal(node('DUP_BAG').dataset.status, 'issue');
  assert.notEqual(node('DUP_NAME').dataset.time, 'ACK');
});
test('residual INF passport ACK clears only that duplicate, preserving other GOV failures', async () => {
  const { c, click, node } = setup();
  const duplicate = { passportNo: 'P111111', dob: '01JAN25', bns: ['001', '002'] };
  c.currentSy.govAqq = { duplicatePassports: [duplicate], govDtaBnList: ['003'] };
  c.currentSy.records = [{ bn: '001', name: 'ADULT/ONE' }, { bn: '002', name: 'INFANT/ONE' }];
  await click(c.passportExceptionKey(duplicate));
  assert.equal(c.unresolvedDuplicatePassports().length, 0);
  assert.equal(node('GOV').dataset.status, 'issue'); assert.equal(node('GOV').dataset.time, '1');
  c.currentSy.govAqq.govDtaBnList = []; c.applyExceptionAcknowledgementState();
  assert.equal(node('GOV').dataset.status, 'done');
  duplicate.bns.push('004'); c.applyExceptionAcknowledgementState();
  assert.equal(node('GOV').dataset.status, 'issue');
});
test('save failure leaves the exception open and offers retry', async () => {
  const { c, click, node } = setup();
  c.applyExceptionAcknowledgementState(); c.apiJson = async () => { throw Error('Unavailable'); };
  const button = await click(c.mealExceptionKey());
  assert.equal(button.disabled, false); assert.match(button.textContent, /Retry/);
  assert.equal(node('MEAL_ORDER').dataset.status, 'issue');
  assert.equal(Object.keys(c.currentWarningAckMap).length, 0);
});
test('ACK is scoped to operator and flight; late save cannot mark the next flight', async () => {
  const { c, click, node } = setup();
  const key = c.mealExceptionKey(); await click(key);
  c.currentUserName = () => 'Other'; c.applyExceptionAcknowledgementState();
  assert.equal(node('MEAL_ORDER').dataset.status, 'issue');
  let finish; c.apiJson = () => new Promise(resolve => { finish = resolve; });
  const pending = click(key); c.currentSy = { ...c.currentSy, flightDate: '19NOV26' }; c.currentWarningAckMap = {};
  finish({ acknowledgements: [{ by: 'Other' }] }); await pending;
  assert.equal(Object.keys(c.currentWarningAckMap).length, 0);
});
test('large exception groups fit API keys and positional identities remain distinct', () => {
  const { c } = setup();
  assert.ok(c.exceptionKey('TEST', Array.from({ length: 500 }, (_, i) => `BN${i}`)).length < 500);
  assert.notEqual(c.exceptionKey('TEST', ['A', 'B']), c.exceptionKey('TEST', ['B', 'A']));
  assert.equal(c.exceptionKey('TEST', { b: 2, a: 1 }), c.exceptionKey('TEST', { a: 1, b: 2 }));
});
