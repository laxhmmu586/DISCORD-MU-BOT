const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/public/scan-outbox.js'), 'utf8');
function harness(options = {}) {
  const ctx = { window:{} }; vm.runInNewContext(source, ctx);
  const data = new Map(), calls = [], counts = [], errors = [];
  let next = 0;
  const storage = {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const config = {storage,key:'flight-date-tab',uuid:()=>`test-request-${++next}`,canSubmit:()=>true,
    submit:async item=>{ calls.push(item); return true; },onChanged:count=>counts.push(count),onError:error=>errors.push(error),...options};
  return {create:()=>ctx.window.createScanOutbox(config),config,storage,data,calls,counts,errors};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
test('rapid distinct decoded passes persist while first request is blocked; repeated frames deduplicate', async () => {
  let finish;
  const calls = [], h = harness({submit:item=>{calls.push(item);return new Promise(resolve=>{finish=resolve;});}}), box=h.create();
  box.capture('PASS-A'); box.capture('PASS-B'); box.capture('PASS-C'); box.capture('PASS-B');
  assert.equal(box.pending,3); assert.equal(calls.length,1);
  assert.equal(JSON.parse(h.data.get(h.config.key)).length,3);
  finish(true); await tick(); void box.pump(); await tick();
  assert.equal(calls[1].text,'PASS-B'); finish(true); await tick(); void box.pump(); await tick();
  assert.equal(calls[2].text,'PASS-C'); finish(true); await tick(); assert.equal(box.pending,0);
});
test('unconfirmed save survives page reload and retries with exactly the same request ID', async () => {
  const h=harness({submit:async()=>false}), box=h.create(); box.capture('PASS-A'); await tick();
  const original=JSON.parse(h.data.get(h.config.key))[0];
  const replay=h.create(); let received;
  h.config.submit=async item=>{received=item;return true;};
  // Recreate with the recovered connection.
  const recovered=h.create(); await recovered.pump();
  assert.equal(received.id,original.id); assert.equal(received.text,original.text); assert.equal(recovered.pending,0);
  assert.equal(replay.pending,1);
});
test('warning dialogs pause submission while further camera results are retained', async () => {
  let allowed=false;
  const h=harness({canSubmit:()=>allowed}), box=h.create();
  box.capture('PASS-A'); box.capture('PASS-B'); await tick(); assert.equal(h.calls.length,0);
  allowed=true; await box.pump(); await box.pump(); assert.equal(h.calls.length,2); assert.equal(box.pending,0);
});
test('storage failure never submits or pretends to retain a decoded pass', () => {
  const h=harness({storage:{getItem:()=>null,setItem:()=>{throw new Error('Storage full');}}}), box=h.create();
  assert.throws(()=>box.capture('PASS-A'),/Storage full/); assert.equal(h.calls.length,0); assert.equal(box.pending,0);
});
test('failed removal after acknowledgement retains the same ID for safe replay', async () => {
  const h=harness(), box=h.create();
  h.config.submit=async()=>true;
  const write=h.storage.setItem; h.storage.setItem=(key,value)=>{if(value==='[]') throw new Error('Storage full');write(key,value);};
  box.capture('PASS-A'); await tick(); assert.equal(box.pending,1); assert.equal(h.errors.length,1);
  h.storage.setItem=write; await box.pump(); assert.equal(box.pending,0);
});
