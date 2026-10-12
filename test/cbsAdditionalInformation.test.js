const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const drive = read('googleDrive.js');
const server = read('index.js');
const page = read('public/public/cbs.html');
const form = read('public/public/pir-form.html');
const functionSource = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  const next = source.indexOf('\n    function ', start + 1);
  return source.slice(start, next);
};

const storage = vm.createContext({});
vm.runInContext(drive.match(/const CBS_HEADERS = \[[\s\S]*?\];/)[0], storage);
vm.runInContext(drive.slice(drive.indexOf('function cbsRecordFromSheet('), drive.indexOf('async function appendCbsCase(')), storage);
const display = vm.createContext({ document: { documentElement: { lang: 'en' } }, PirDelivery: require('../public/public/pir-delivery') });
for (const name of ['label', 'escapeHtml', 'inferCaseType', 'hasValue', 'normalizeShippingMethodLabel', 'renderValue', 'fullPassengerFileHtml']) {
  vm.runInContext(functionSource(page, name), display);
}
const sanitize = vm.createContext({});
vm.runInContext(server.slice(server.indexOf('function sanitizeCbsText('), server.indexOf('function isValidRushBagTag(')), sanitize);
const creation = server.slice(server.indexOf("app.post('/cbs-cases',"), server.indexOf("app.post('/cbs-cases/:rowNumber/update'"));
const sanitization = creation.match(/additionalInformation: (sanitizeCbsText\(body\.additionalInformation, 1000\))/)?.[1];
assert.ok(sanitization, 'case creation must accept the optional information');

for (const caseType of ['AHL', 'DPR']) {
  test(`${caseType}: additional information survives sheet storage and renders safely in both languages`, () => {
    sanitize.body = { additionalInformation: '  红色行李箱 <script>alert("x")</script> & strap  ' };
    const additionalInformation = vm.runInContext(sanitization, sanitize);
    const values = storage.cbsValuesFromRecord({ caseType, bagTag: 'MU123456', additionalInformation });
    const restored = storage.cbsRecordFromSheet(values, 2);
    assert.equal(restored.additionalInformation, additionalInformation);
    assert.equal(JSON.parse(values[32]).additionalInformation, additionalInformation);
    for (const [lang, title] of [['en', 'Other useful information'], ['zh', '其他有用信息']]) {
      display.document.documentElement.lang = lang;
      const html = display.fullPassengerFileHtml(restored);
      assert.ok(html.includes(title));
      assert.ok(html.includes('红色行李箱 &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; strap'));
      assert.ok(!html.includes('<script>'));
      assert.ok(html.indexOf(title) > html.indexOf(lang === 'en' ? 'Baggage information' : '行李资料'));
    }
  });

  test(`${caseType}: empty or missing additional information remains optional and does not create an empty display field`, () => {
    for (const value of [undefined, '', '  ']) {
      sanitize.body = { additionalInformation: value };
      const additionalInformation = vm.runInContext(sanitization, sanitize);
      assert.equal(additionalInformation, '');
      const restored = storage.cbsRecordFromSheet(storage.cbsValuesFromRecord({ caseType, bagTag: 'MU123456', additionalInformation }), 2);
      display.document.documentElement.lang = 'en';
      assert.ok(!display.fullPassengerFileHtml(restored).includes('Other useful information'));
    }
  });
}

test('additional information is limited to 1000 characters and available before attachments for both report types', () => {
  sanitize.body = { additionalInformation: '行'.repeat(1100) };
  assert.equal(vm.runInContext(sanitization, sanitize).length, 1000);
  const textarea = form.match(/<textarea name="additionalInformation"[^>]*>/)?.[0];
  assert.ok(textarea);
  assert.match(textarea, /maxlength="1000"/);
  assert.doesNotMatch(textarea, /required|disabled/);
  assert.ok(form.indexOf(textarea) < form.indexOf('data-attachment-group'));
  assert.match(form, /Object\.fromEntries\(new FormData\(form\)\.entries\(\)\)/);
});

test('baggage assistance offers AHL and DPR without the wrong baggage option', () => {
  const choices = read('public/public/cbs-form.html');
  assert.doesNotMatch(choices, /wrong-baggage-form|误取行李|choice--wrong/);
  assert.match(choices, /pir-form\.html\?type=AHL/);
  assert.match(choices, /pir-form\.html\?type=DPR/);
  assert.match(choices, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
