const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(decode = () => { throw { getKind: () => 'NotFoundException' }; }) {
  const elements = new Map();
  const draws = [];
  let requests = 0, stopped = 0;
  const track = { stop() { stopped++; }, getCapabilities: () => ({}) };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, value: '', className: '', textContent: '',
      addEventListener(name, fn) { this[name] = fn; },
      focus() {}, setAttribute() {},
      getBoundingClientRect: () => id === '.aim-box'
        ? { left: 50, top: 200, width: 300, height: 200 }
        : { left: 0, top: 0, width: 400, height: 600 },
      videoWidth: 1920, videoHeight: 1080, readyState: 2,
      play: async () => {}
    });
    return elements.get(id);
  }
  const timers = [];
  const context = vm.createContext({
    window: { firebase: null, location: { href: 'https://example.com/scan2.html', replace() {} }, addEventListener() {} },
    document: { querySelector: element, addEventListener() {}, createElement: () => ({ getContext: () => ({ drawImage: (...args) => draws.push(args) }) }) },
    navigator: { mediaDevices: { getUserMedia: async () => { requests++; return stream; } } },
    ZXingBrowser: { BrowserPDF417Reader: class { decodeFromCanvas(canvas) { return decode(canvas); } } },
    URL, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    localStorage: {}, sessionStorage: {}
  });
  context.window.ZXingBrowser = context.ZXingBrowser;
  const html = fs.readFileSync('public/public/scan2.html', 'utf8');
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  return { context, element, draws, timers, requests: () => requests, stopped: () => stopped };
}

test('scan2 crops the guide in native camera coordinates and periodically scans full frame', async () => {
  const s = setup();
  await s.element('#start').click();
  assert.equal(s.requests(), 1);
  const crop = s.draws[0];
  assert.equal(crop[1], 636);
  assert.equal(crop[2], 288);
  assert.equal(crop[3], 648);
  assert.equal(crop[4], 504);
  for (let i = 0; i < 4; i++) s.timers[i]();
  assert.deepEqual(s.draws[4].slice(1, 5), [0, 0, 1920, 1080]);
});

test('scan2 tolerates minified decoder errors and reports checksum failures', async () => {
  const s = setup(() => { throw { name: 'e', getKind: () => 'ChecksumException' }; });
  await s.element('#start').click();
  assert.match(s.element('#status').textContent, /Barcode found but unreadable/);
  assert.equal(s.stopped(), 0);
  assert.equal(s.timers.length, 1);
});

test('scan2 prevents duplicate camera starts and cancels queued frames on stop', async () => {
  const s = setup();
  await Promise.all([s.element('#start').click(), s.element('#start').click()]);
  await s.element('#start').click();
  assert.equal(s.requests(), 1);
  s.element('#stop').click();
  const count = s.draws.length;
  s.timers[0]();
  assert.equal(s.draws.length, count);
  assert.equal(s.element('#preview').srcObject, null);
  assert.ok(s.stopped() > 0);
});
