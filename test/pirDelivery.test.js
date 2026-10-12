const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PirDelivery = require('../public/public/pir-delivery');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const server = read('index.js');
const drive = read('googleDrive.js');
const pdfContext = { Buffer, PirDelivery };
vm.createContext(pdfContext);
vm.runInContext(server.slice(server.indexOf('function pdfSafeText('), server.indexOf('\nfunction ', server.indexOf('function createPirPdf(') + 1)), pdfContext);

for (const method of ['permanent', 'temporary', 'pickup']) {
  test(`${method}: only the selected delivery address survives submission and storage`, () => {
    const record = PirDelivery.normalize({ deliveryPreference: method, permanentAddress: '123 Main St', temporaryAddress: 'Hotel, 456 Beach Rd', temporaryAddressValidUntil: '2026-10-15' });
    assert.equal(record.permanentAddress, method === 'permanent' ? '123 Main St' : '');
    assert.equal(record.temporaryAddress, method === 'temporary' ? 'Hotel, 456 Beach Rd' : '');
    assert.equal(record.temporaryAddressValidUntil, method === 'temporary' ? '2026-10-15' : '');
    const storage = {};
    vm.createContext(storage);
    vm.runInContext(drive.slice(drive.indexOf('function cbsOriginalFormData('), drive.indexOf('function cbsValuesFromRecord(')), storage);
    const saved = JSON.parse(storage.cbsOriginalFormData(record));
    assert.equal(saved.deliveryPreference, method);
    vm.runInContext(drive.match(/const CBS_HEADERS = \[[\s\S]*?\];/)[0], storage);
    vm.runInContext(drive.slice(drive.indexOf('function cbsRecordFromSheet('), drive.indexOf('function cbsOriginalFormData(')), storage);
    vm.runInContext(drive.slice(drive.indexOf('function cbsValuesFromRecord('), drive.indexOf('async function appendCbsCase(')), storage);
    const restored = storage.cbsRecordFromSheet(storage.cbsValuesFromRecord({ ...record, caseType: 'AHL', bagTag: 'MU123456' }), 2);
    assert.equal(restored.deliveryPreference, method);
    assert.equal(restored.permanentAddress, record.permanentAddress);
    assert.equal(restored.temporaryAddress, record.temporaryAddress);
    for (const language of ['en', 'zh']) {
      const rows = PirDelivery.fields(saved, language);
      assert.equal(rows[0][1], PirDelivery.pick(PirDelivery.methods[method], language));
      assert.equal(rows.at(-1)[1], PirDelivery.pick(PirDelivery.hints[method], language));
      const pdf = pdfContext.createPirPdf({ ...saved, language, caseType: 'AHL', passengerName: 'TEST/PASSENGER' }).toString('binary');
      const text = PirDelivery.pick(PirDelivery.methods[method], language);
      assert.ok(language === 'en' ? pdf.includes(text) : pdf.includes(Buffer.from(text, 'utf16le').swap16().toString('hex').toUpperCase()));
      assert.equal(pdf.includes('0.7 0.05 0.04 rg'), method !== 'pickup');
      assert.match(pdf, /\/Count 3\b/);
    }
  });
}

test('delivery validates the selected address, accepts pickup without an address, and rejects unknown choices', () => {
  assert.throws(() => PirDelivery.normalize({ deliveryPreference: 'permanent', temporaryAddress: 'hotel' }), /address/);
  assert.throws(() => PirDelivery.normalize({ deliveryPreference: 'temporary', permanentAddress: 'home' }), /address/);
  assert.equal(PirDelivery.normalize({ deliveryPreference: 'pickup' }).permanentAddress, '');
  for (const method of ['courier', '__proto__', 'toString']) assert.throws(() => PirDelivery.normalize({ deliveryPreference: method }), /Invalid/);
});

test('legacy submissions retain address compatibility without inferring a delivery preference', () => {
  const old = PirDelivery.normalize({ permanentAddress: 'Home', temporaryAddress: 'Hotel', addressAvailable: 'Yes' });
  assert.equal(old.deliveryPreference, '');
  assert.equal(old.temporaryAddress, 'Hotel');
  assert.equal(PirDelivery.fields(old)[0][1], 'Not provided (legacy report)');
  assert.throws(() => PirDelivery.normalize({}), /address/);
  assert.match(pdfContext.createPirPdf(old).toString('binary'), /\/Count 2\b/);
});

test('DPR submissions do not require or retain delivery information', () => {
  const empty = PirDelivery.normalize({ caseType: 'DPR' });
  assert.deepEqual(empty, { deliveryPreference: '', permanentAddress: '', temporaryAddress: '', temporaryAddressValidUntil: '', addressAvailable: '' });
  assert.deepEqual(PirDelivery.normalize({ caseType: 'DPR', deliveryPreference: 'temporary', temporaryAddress: 'Hotel' }), empty);
});

test('delivery controls follow the case type, including previously selected addresses', () => {
  const page = read('public/public/pir-form.html');
  const control = () => ({ disabled: false, required: false });
  const field = () => ({ hidden: false, control: control(), querySelector() { return this.control; } });
  const label = { hidden: false };
  const context = {
    PirDelivery, typeSelect: { value: 'AHL' },
    deliveryPreference: { value: 'temporary', closest: () => label },
    permanentAddressField: field(), temporaryAddressField: field(), validUntilField: field(),
    deliveryHint: {}, deliveryNote: {}, document: { documentElement: { lang: 'en' } }
  };
  vm.createContext(context);
  vm.runInContext(page.slice(page.indexOf('    function setAddressFields()'), page.indexOf('    typeSelect.addEventListener')), context);
  context.setAddressFields();
  assert.equal(label.hidden, false);
  assert.equal(context.deliveryPreference.required, true);
  assert.equal(context.temporaryAddressField.control.required, true);
  context.typeSelect.value = 'DPR';
  context.setAddressFields();
  assert.equal(label.hidden, true);
  assert.equal(context.deliveryPreference.disabled, true);
  assert.equal(context.deliveryPreference.required, false);
  for (const name of ['permanentAddressField', 'temporaryAddressField', 'validUntilField']) {
    assert.equal(context[name].hidden, true);
    assert.equal(context[name].control.disabled, true);
    assert.equal(context[name].control.required, false);
  }
  assert.equal(context.deliveryHint.hidden, true);
  assert.equal(context.deliveryNote.hidden, true);
  context.typeSelect.value = 'AHL';
  context.setAddressFields();
  assert.equal(label.hidden, false);
  assert.equal(context.deliveryPreference.disabled, false);
  assert.equal(context.temporaryAddressField.hidden, false);
});

test('both languages preserve the exact requested third-party notice', () => {
  assert.equal(PirDelivery.notice[0], 'Please note: Once the baggage is handed over for delivery, it will be handled by a third-party delivery service. Due to delivery arrangements and actual operating conditions, we are unable to provide or confirm a specific delivery time.');
  assert.equal(PirDelivery.notice[1], '请注意：行李交付配送后，由第三方配送服务负责后续运输。由于配送安排及实际情况，我们无法提供或确认具体送达时间。');
});

test('CBS renders delivery before passenger information and escapes passenger addresses', () => {
  const page = read('public/public/cbs.html');
  const context = { PirDelivery, document: { documentElement: { lang: 'en' } }, hasValue: (x) => x != null && String(x).trim() !== '', label: (en) => en, inferCaseType: () => 'AHL', renderValue: (x) => x || '--', escapeHtml: (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') };
  vm.createContext(context);
  vm.runInContext(page.slice(page.indexOf('    function fullPassengerFileHtml('), page.indexOf('    function updateFormHtml(')), context);
  const html = context.fullPassengerFileHtml({ originalFormData: JSON.stringify({ deliveryPreference: 'temporary', temporaryAddress: '<img src=x onerror=alert(1)>' }) });
  assert.ok(html.indexOf('Delivery Information') < html.indexOf('Passenger information'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes(PirDelivery.hints.temporary[0]));
  assert.ok(!html.includes(PirDelivery.notice[0]));
  assert.ok(!html.includes('Instructions:'));
  context.document.documentElement.lang = 'zh';
  context.label = (en, zh) => zh;
  const chinese = context.fullPassengerFileHtml({ deliveryPreference: 'temporary', temporaryAddress: '测试地址', temporaryAddressValidUntil: '2026-10-10' });
  assert.ok(chinese.includes('测试地址'));
  assert.ok(chinese.includes('2026-10-10'));
  assert.ok(chinese.includes('寄件，提供临时地址'));
  assert.ok(!chinese.includes(PirDelivery.hints.temporary[1]));
  assert.ok(!chinese.includes(PirDelivery.notice[1]));
  assert.match(page, /\.full-file-section\.delivery-information \{ background:#fff3e6/);
});
