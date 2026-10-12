const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../public/public/index.html'), 'utf8');
const source = name => html.slice(html.indexOf(`      function ${name}(`)).split(/\n      (?:async )?function /)[0];

function harness() {
  const calls = [];
  const context = {
    resultPanel: { innerHTML: 'open', dataset: { panelTitle: 'GOV/AQQ' }, style: {} },
    refreshOpenPassengerModal() { calls.push('passenger'); },
    renderGovPanel() { calls.push('gov'); },
    showPassengerModal() {},
    updateFlightFromSy() { context.rerenderActiveRealtimePanel(); }
  };
  vm.createContext(context);
  for (const name of ['resetPanelState', 'rerenderActiveRealtimePanel', 'renderSy', 'renderPassenger']) {
    vm.runInContext(source(name), context);
  }
  return { context, calls };
}

test('background refresh updates an open GOV panel but does not reopen an empty one', () => {
  const { context, calls } = harness();
  context.rerenderActiveRealtimePanel();
  assert.ok(calls.includes('gov'));
  calls.length = 0;
  context.resultPanel.innerHTML = '';
  context.rerenderActiveRealtimePanel();
  assert.ok(!calls.includes('gov'));
});

test('closing, a new SY search, and passenger search all clear panel identity before refresh', () => {
  for (const action of ['resetPanelState', 'renderSy', 'renderPassenger']) {
    const { context, calls } = harness();
    context[action]({ sy: {} });
    context.rerenderActiveRealtimePanel();
    assert.equal(context.resultPanel.dataset.panelTitle, undefined);
    assert.ok(!calls.includes('gov'), action);
  }
});

test('refresh closes a stale passenger modal when its BN no longer exists', () => {
  let closed = false;
  const context = {
    currentSy: {}, normalizedBn: String, allPassengerRecords: () => [],
    document: { querySelector: () => ({ dataset: { passengerBn: '137' }, querySelector: () => ({}) }) },
    closePassengerModal() { closed = true; }
  };
  vm.createContext(context);
  vm.runInContext(source('refreshOpenPassengerModal'), context);
  context.refreshOpenPassengerModal();
  assert.equal(closed, true);
});
