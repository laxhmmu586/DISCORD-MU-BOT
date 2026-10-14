const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
const server = read('index.js');
const page = read('public/public/cbs.html');
function functionSource(source, name) {
  const match = source.match(new RegExp(`^( *)(?:async )?function ${name}\\([^]*?\\n\\1\\}`, 'm'));
  assert.ok(match, `Missing ${name}`);
  return match[0];
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function followUpHarness(overrides = {}) {
  let expire;
  const events = [];
  const context = vm.createContext({
    console:{ error:() => {} },
    syncUpcomingRushOnHand:async () => [{ updated:true }],
    sendUpcomingRushToDiscord:async () => ({ sent:true }),
    broadcastCbsRefresh:(event) => events.push(event),
    setTimeout:(fn, ms) => { assert.equal(ms, 2000); expire = fn; return 1; },
    clearTimeout:() => {},
    ...overrides
  });
  vm.runInContext(functionSource(server, 'finishUpcomingRushUpdate'), context);
  return { context, events, expire:() => expire() };
}

test('Upcoming Rush acknowledges a saved case even while On-hand matching is stalled', async () => {
  const matching = deferred();
  let discordCalls = 0;
  const h = followUpHarness({
    syncUpcomingRushOnHand:() => matching.promise,
    sendUpcomingRushToDiscord:async () => { discordCalls++; return { sent:true }; }
  });
  const result = h.context.finishUpcomingRushUpdate({}, {}, 'Staff');
  await Promise.resolve();
  assert.equal(discordCalls, 1, 'Discord starts independently of On-hand matching');
  h.expire();
  assert.equal((await result).followUpPending, true);
  assert.equal(h.events.length, 0);
  matching.resolve([]);
  await new Promise(setImmediate);
  assert.deepEqual(h.events, ['/cbs-upcoming-rush']);
});

test('slow Discord delivery continues once after the saved response', async () => {
  const delivery = deferred();
  let calls = 0;
  const h = followUpHarness({ sendUpcomingRushToDiscord:() => { calls++; return delivery.promise; } });
  const result = h.context.finishUpcomingRushUpdate({}, {}, 'Staff');
  h.expire();
  assert.equal((await result).followUpPending, true);
  delivery.resolve({ sent:true });
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  assert.equal(h.events.length, 1);
});

test('On-hand failure preserves the saved response and does not skip Discord', async () => {
  const h = followUpHarness({ syncUpcomingRushOnHand:async () => { throw new Error('Sheets unavailable'); } });
  const result = await h.context.finishUpcomingRushUpdate({}, {}, 'Staff');
  assert.equal(result.followUpPending, false);
  assert.equal(result.onHandMatchError, 'Sheets unavailable');
  assert.equal(result.discord.sent, true);
});

test('Discord failure is reported separately from the saved case', async () => {
  const h = followUpHarness({ sendUpcomingRushToDiscord:async () => { throw new Error('Discord unavailable'); } });
  const result = await h.context.finishUpcomingRushUpdate({}, {}, 'Staff');
  assert.equal(result.followUpPending, false);
  assert.equal(result.discordError, 'Discord unavailable');
  assert.equal(result.onHandMatches[0].updated, true);
});

test('Upcoming Rush route returns the persisted record with pending follow-ups', async () => {
  const h = followUpHarness({ syncUpcomingRushOnHand:() => new Promise(() => {}) });
  let handler;
  let saves = 0;
  const saved = { rowNumber:12, status:'Upcoming Rush', updateEvents:[{ key:'upcoming_rush' }] };
  Object.assign(h.context, {
    app:{ post:(_route, fn) => { handler = fn; } },
    buildCbsUpdateFields:() => ({ updateEvent:{ key:'upcoming_rush' } }),
    sanitizeCbsText:(value) => value || '',
    updateCbsCase:async () => { saves++; return { updated:true, record:saved }; }
  });
  const start = server.indexOf("app.post('/cbs-cases/:rowNumber/update'");
  vm.runInContext(server.slice(start, server.indexOf('\n});', start) + 4), h.context);
  const res = { statusCode:200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const request = handler({ params:{ rowNumber:12 }, body:{ updatedBy:'Staff' } }, res);
  await new Promise(setImmediate);
  h.expire();
  await request;
  assert.equal(saves, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.record, saved);
  assert.equal(res.body.followUpPending, true);
});

function submitHarness(overrides = {}) {
  let handler;
  const button = { disabled:false, textContent:'Update Tracking' };
  const form = { dataset:{ rowNumber:'12', updateMode:'upcoming_rush' }, querySelectorAll:() => [button] };
  const alerts = [];
  const context = vm.createContext({
    casesOutput:{ addEventListener:(_type, fn) => { handler = fn; } },
    FormData:class { entries() { return [['rushFlight', 'MU583'], ['rushDate', '2026-10-15'], ['rushTagNumber', 'MU123456']][Symbol.iterator](); } },
    rushBagTagNumber:(value) => value,
    label:(en) => en,
    currentUpdater:async () => 'staff@example.com',
    updateCase:async () => {},
    alert:(message) => alerts.push(message),
    ...overrides
  });
  const start = page.indexOf("    casesOutput.addEventListener('submit', async (event) => {");
  vm.runInContext(page.slice(start, page.indexOf('\n    });', start) + 8), context);
  const event = { target:{ closest:() => form }, preventDefault:() => {}, submitter:button };
  return { submit:() => handler(event), button, form, alerts };
}

test('double clicking Upcoming Rush submits once and restores the button after completion', async () => {
  const pending = deferred();
  let requests = 0;
  const h = submitHarness({ updateCase:async (_row, payload) => { requests++; assert.equal(payload.type, 'upcoming_rush'); await pending.promise; } });
  const first = h.submit();
  await h.submit();
  assert.equal(requests, 1);
  assert.equal(h.button.disabled, true);
  assert.equal(h.button.textContent, 'Saving…');
  pending.resolve();
  await first;
  assert.equal(h.button.disabled, false);
  assert.equal(h.button.textContent, 'Update Tracking');
  assert.equal(h.form.dataset.submitting, undefined);
});

test('authentication and submission errors always restore form controls', async () => {
  for (const overrides of [
    { currentUpdater:async () => null },
    { currentUpdater:async () => { throw new Error('Auth failed'); } },
    { updateCase:async () => { throw new Error('Network failed'); } }
  ]) {
    const h = submitHarness(overrides);
    await h.submit();
    assert.equal(h.button.disabled, false);
    assert.equal(h.form.dataset.submitting, undefined);
    assert.equal(h.alerts.length, 1);
  }
});

test('case update deadline covers a stalled response body and releases its timer', async () => {
  let expire;
  let cleared = false;
  const context = vm.createContext({
    apiBase:'https://example.test', AbortController,
    setTimeout:(fn, ms) => { assert.equal(ms, 45000); expire = fn; return 1; },
    clearTimeout:() => { cleared = true; },
    fetch:async (_url, options) => ({ ok:true, signal:options.signal }),
    parseJson:(res) => new Promise((_resolve, reject) => res.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name:'AbortError' }))))
  });
  vm.runInContext(functionSource(page, 'requestCaseUpdate'), context);
  const result = context.requestCaseUpdate('cbs-cases/12/update', { type:'upcoming_rush' });
  await new Promise(setImmediate);
  expire();
  await assert.rejects(result, { name:'AbortError' });
  assert.equal(cleared, true);
});

test('acknowledged Upcoming Rush renders immediately without another Sheets read', async () => {
  for (const type of ['upcoming_rush', 'upcoming_rush_delete']) {
    const saved = { rowNumber:12, status:'Upcoming Rush', updateEvents:[{ key:'upcoming_rush' }] };
    const other = { rowNumber:13 };
    let rendered = false;
    let notice;
    const context = vm.createContext({
      window:{ _cbsRows:[{ rowNumber:12 }, other] },
      casesOutput:{ style:{}, querySelectorAll:() => [{ dataset:{ rowNumber:'12' }, append:(element) => { notice = element; } }] },
      document:{ createElement:() => ({ setAttribute:() => {} }) },
      requestCaseUpdate:async () => ({ record:saved, followUpPending:true }),
      renderCases:() => { rendered = true; },
      loadCases:() => { assert.fail('Must not wait for another Sheets read'); },
      label:(en) => en,
      alert:assert.fail
    });
    vm.runInContext(functionSource(page, 'updateCase'), context);
    await context.updateCase('12', { type });
    assert.equal(rendered, true);
    assert.equal(context.window._cbsRows[0], saved);
    assert.equal(context.window._cbsRows[1], other);
    assert.match(notice.textContent, /Saved.*still processing/);
    assert.equal(context.casesOutput.style.opacity, '1');
  }
});

test('unconfirmed timeout tells staff to inspect history before resubmitting', async () => {
  const alerts = [];
  const context = vm.createContext({
    casesOutput:{ style:{} },
    requestCaseUpdate:async () => { throw Object.assign(new Error('Aborted'), { name:'AbortError' }); },
    alert:(message) => alerts.push(message)
  });
  vm.runInContext(functionSource(page, 'updateCase'), context);
  await context.updateCase('12', { type:'upcoming_rush' });
  assert.match(alerts[0], /Saving was not confirmed; refresh the case and check its history/);
  assert.equal(context.casesOutput.style.opacity, '1');
});
