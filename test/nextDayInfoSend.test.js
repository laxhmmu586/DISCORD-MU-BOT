const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require.resolve('../public/public/index.html'), 'utf8');
const start = html.indexOf('      async function sendNextDayInfoFromNode(');
const source = html.slice(start, html.indexOf('\n      function updateSelectedNode(', start));

function harness(response) {
  const calls = [];
  const alerts = [];
  const step = { complete: true, details: { domesticTransfer: '999' }, detailText: 'Old totals' };
  const node = { dataset: { status: 'done', time: 'SENT' } };
  const context = {
    currentSy: { flightNo: 'MU586', flightDate: '10OCT26', reservationTicketed: ['RET', '0', '12', '109'], jcsy: { complete: false, rows: [] } },
    confirm: () => true,
    alert: (message) => alerts.push(message),
    stepByKey: () => step,
    forgetCompletedSyNode() {},
    showTimelineNodeCard() {},
    refreshSyBadges() { node.dataset.time = step.complete ? 'SENT' : 'MISSING'; },
    nodeTime: { textContent: '' },
    AbortController,
    setTimeout,
    clearTimeout,
    apiJson: async (endpoint, options) => {
      calls.push({ endpoint, body: JSON.parse(options.body), pendingDetails: { ...step.details }, pendingText: step.detailText });
      if (response instanceof Error) throw response;
      return response;
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, node, step, calls, alerts };
}

test('NEXTDAY INFO validates tomorrow on the server when the dashboard has no current-day JCSY', async () => {
  const details = { domesticTransfer: '101', internationalTransfer: '2', overnightPassengers: '18' };
  const h = harness({ ok: true, details, detailText: 'Fresh tomorrow totals', sentAt: '2026-10-10T12:25:50Z' });
  await h.context.sendNextDayInfoFromNode(h.node);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].endpoint, '/nextday-info/send');
  assert.deepEqual(h.calls[0].body, { flightNo: 'MU586' });
  assert.deepEqual(h.calls[0].pendingDetails, {});
  assert.equal(h.calls[0].pendingText, '');
  assert.deepEqual(h.step.details, details);
  assert.equal(h.step.complete, true);
  assert.deepEqual(h.alerts, []);
});

test('NEXTDAY INFO surfaces server validation failure and clears the sending state', async () => {
  const message = 'Current SY or JCSY figures are incomplete. Run SY and JCSY again, then retry.';
  const h = harness(new Error(message));
  await h.context.sendNextDayInfoFromNode(h.node);
  assert.equal(h.calls.length, 1);
  assert.equal(h.step.complete, false);
  assert.equal(h.node.dataset.time, 'MISSING');
  assert.deepEqual(h.alerts, [message]);
});
