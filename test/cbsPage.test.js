const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'cbs.html'), 'utf8');
const pirForm = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'pir-form.html'), 'utf8');
const drive = fs.readFileSync(path.join(__dirname, '..', 'googleDrive.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('Add On-hand records are added to and displayed in Open Case', () => {
  assert.match(drive, /CBS_UNRESOLVED_BAGGAGE_SHEET_GID = Number\(process\.env\.CBS_UNRESOLVED_BAGGAGE_SHEET_GID \|\| 523026916\)/);
  assert.match(page, /title="Add On-hand"/);
  assert.match(page, /id="open-cases-tab"[\s\S]*id="closed-cases-tab"[\s\S]*id="add-baggage-tab"[\s\S]*id="worldtracer-tab"/);
  assert.match(page, /<h1>Add On-hand<\/h1>/);
  assert.doesNotMatch(page, />Add Baggage</);
  assert.match(drive, /await appendCbsUnresolvedBaggageCase\(cleanRecord\);/);
  assert.match(page, /await loadUnresolvedBaggage\(\);\s*showSection\('open'\);/);
});

test('On-hand cases match the passenger case layout and support WorldTracer progress', () => {
  assert.match(page, /<th>WorldTracer File Number<\/th><th>Bag Tag<\/th><th>Direction<\/th>/);
  assert.match(page, /class="case-detail-layout"><div class="case-progress-column">\$\{unresolvedProgressHtml\(progressRow\)\}/);
  assert.match(page, /<option value="worldtracer">WorldTracer<\/option>/);
  assert.match(drive, /worldTracerFileNumber: values\[11\]/);
  assert.match(drive, /'WorldTracer File Number'/);
  assert.match(drive, /!L\$\{target\.rowNumber\}/);
  assert.match(drive, /!L1`[\s\S]*CBS_UNRESOLVED_BAGGAGE_HEADERS\[11\]/);
  assert.match(server, /action === 'worldtracer'/);
});

test('On-hand shipping uses the Passenger Filed delivery methods without email handling', () => {
  const onHandFields = page.match(/if \(action === 'shipped'\) return `([\s\S]*?)`;/)?.[1] || '';
  for (const method of ['ADC - All Day Courier', 'BDO', 'FedEx Delivery', 'Pick Up at Airport', 'Passenger Pay for Shipping']) assert.match(onHandFields, new RegExp(method));
  assert.match(onHandFields, /data-shipping-tracking hidden/);
  assert.match(onHandFields, /data-shipping-address hidden/);
  assert.match(server, /if \(action === 'shipped'\) \{/);
  assert.match(server, /A tracking number is required for FedEx Delivery/);
});

test('Create Rush only asks for a WorldTracer file when the On-hand case has none', () => {
  assert.match(page, /worldTracerFileNumber \? `<input type="hidden" name="worldTracerFileNumber"/);
  assert.match(page, /data-world-tracer-file="\$\{escapeHtml\(active\.worldTracerFileNumber\)\}"/);
  assert.match(page, /unresolvedUpdateFieldsHtml\(select\.value, form\.dataset\.bagTag, form\.dataset\.worldTracerFile\)/);
});

test('CBS passenger information keeps all operationally required fields visible', () => {
  const requiredFields = page.match(/const requiredPassengerFields = \[([\s\S]*?)\n\s*\];/)?.[1] || '';
  for (const label of ['Passenger Name', 'Email', 'Phone', 'Ticket Number', 'Flight Route', 'Permanent Address']) {
    assert.match(requiredFields, new RegExp(`label\\('${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.doesNotMatch(requiredFields, /label\('Bag Tag'/);
  assert.match(page, /requiredFieldGrid\(requiredPassengerFields\)/);
});

test('CBS tracking offers the requested bags stage', () => {
  assert.match(page, /key:'requested_bags', text:'Requested Bags'/);
  assert.match(page, /if \(key === 'requested_bags'\) return input\('From which station\?', 'fromStation'\)/);
  assert.match(page, /requested\[\\s_-\]\*bags\?/);
  assert.doesNotMatch(page, /event\.key === 'requested_bags' \? 'Update'/);
  assert.match(page, /tracking-step-number/);
  assert.match(page, /const latestClass = index === 0 \? ' is-latest'/);
  assert.match(page, /tracking-chip:not\(:last-child\)::after \{ content:""/);
  assert.match(page, /label\('Case Progress', '案件进度'\)/);
  assert.match(page, /content:"CURRENT"/);
});

test('CBS tracking offers a compact baggage transfer update with a required arrival date', () => {
  assert.match(page, /key:'information', text:'Information'/);
  assert.match(page, /name="informationType" required><option value="rush_to_lax">Baggage Transfer Status Update/);
  assert.match(page, /name="estimatedArrivalTime" type="date" required/);
  assert.match(page, /data-update-mode="information"/);
  assert.match(page, /Baggage Transfer Status Update email/);
  assert.match(page, /data-update-mode="information"\] \{ grid-template-columns:minmax\(220px,320px\); \}/);
});

test('changing Current Stage replaces the form with fields for that stage', () => {
  assert.match(page, /const controls = select\.closest\('\.case-detail-right'\) \|\| select\.closest\('\.tracking-workspace'\)/);
  assert.match(page, /form\.dataset\.updateMode = select\.value/);
  assert.match(page, /fields\.innerHTML = inlineUpdateFieldsHtml\(select\.value\)/);
  assert.match(page, /if \(key === 'worldtracer'\) return input\('File number', 'fileNumber'\)/);
  assert.match(page, /if \(key === 'information'\).*Baggage Transfer Status Update/);
  assert.match(page, /if \(key === 'requested_bags'\) return input\('From which station\?', 'fromStation'\)/);
  assert.match(page, /if \(key === 'shipping'\) return \[shippingMethodSelect/);
  assert.doesNotMatch(page, /input\('AKE number\?', 'akeNumber'\)/);
});

test('case progress uses a vertical left column with case controls and details on the right', () => {
  assert.match(page, /\.case-detail-layout \{[^}]*grid-template-columns:minmax\(280px,360px\) minmax\(0,1fr\)/);
  assert.match(page, /\.tracking-history \{ display:grid/);
  assert.doesNotMatch(page, /scroll-snap-type|scrollbar-gutter|history\.scrollLeft/);
  assert.match(page, /overflow-y:auto/);
  assert.match(page, /scrollbar-width:none/);
  assert.match(page, /tracking-history::-webkit-scrollbar \{ display:none; \}/);
  assert.match(page, /requestAnimationFrame\(syncCaseProgressHeights\)/);
  assert.match(page, /\.reverse\(\);/);
  assert.match(page, /tracking-chip:not\(:last-child\)::after \{ content:""/);
  assert.match(page, /case-progress-column/);
  assert.match(page, /case-detail-right/);
  assert.match(page, /trackingControlHtml\(row, 'progress'\)/);
  assert.match(page, /trackingControlHtml\(row, 'current'\)/);
  assert.match(page, /<div class="case-detail-content">\$\{detailHtml\}<\/div>\$\{passengerNotificationHtml\(row\)\}/);
});

test('CBS tracking offers a Lost update with no extra fields', () => {
  assert.match(page, /key:'lost', text:'Lost'/);
  assert.match(page, /if \(key === 'lost'\) return ''/);
  assert.match(page, /data-cbs-update-mode="lost"/);
  assert.match(page, /Lost baggage notification email/);
});

test('CBS tracking no longer offers Forward to MU', () => {
  assert.doesNotMatch(page, /forward_mu|Forward to MU/);
});

test('shipping updates offer all supported delivery methods', () => {
  assert.match(page, /select name="shippingMethod" data-shipping-method required/);
  for (const method of ['ADC - All Day Courier', 'BDO', 'FedEx Delivery', 'Pick Up at Airport', 'Passenger Pay for Shipping']) assert.match(page, new RegExp(`<option>${method}<\\/option>`));
  assert.match(page, /<option>ADC - All Day Courier<\/option><option>BDO<\/option>/);
  assert.match(page, /data-shipping-tracking placeholder="Tracking number" disabled hidden/);
  assert.match(page, /needsTracking = shippingMethod\.value === 'FedEx Delivery'/);
  assert.match(page, /trackingInput\.required = needsTracking/);
  assert.match(page, /showsAddress = shippingMethod\.value === 'ADC - All Day Courier' \|\| shippingMethod\.value === 'FedEx Delivery'/);
  assert.doesNotMatch(page, /\['ADC - All Day Courier', 'FedEx Delivery', 'Passenger Pay for Shipping'\]\.includes/);
  assert.match(page, /addressInput\.required = false/);
});

test('CBS passenger detail view can recover values from the original form snapshot', () => {
  assert.match(page, /JSON\.parse\(row\.originalFormData \|\| '\{\}'\)/);
});

test('CBS baggage information displays baggage details from sheet column N', () => {
  assert.match(page, /label\('Baggage Details', '行李详情'\), row\.baggageDetails \|\| row\.ahlBagDescription/);
});

test('CBS detail view omits the redundant journey and address section', () => {
  assert.doesNotMatch(page, /<h3>\$\{label\('Journey and address'/);
});

test('PIR form labels the optional attachment category as Others', () => {
  assert.match(pirForm, /<span class="en">Others<\/span><span class="zh">其他附件<\/span>/);
  assert.doesNotMatch(pirForm, />Other document<\/span>/);
});

test('expanded CBS cases show passenger email notification status', () => {
  assert.match(page, /function passengerNotificationHtml\(row\)/);
  assert.match(page, /Create report email/);
  assert.match(page, /WorldTracer update email/);
  assert.match(page, /Baggage request from other station email/);
  assert.match(page, /ADC baggage delivery email/);
  assert.match(page, /FedEx baggage delivery email/);
  assert.match(page, /Airport pickup closure email/);
  assert.match(page, /Passenger-paid shipping email/);
  assert.match(page, /sentKeys\.add\('adc_shipping'\)/);
  assert.match(page, /\.filter\(\(\[key\]\) => sentKeys\.has\(key\)\)/);
  assert.match(page, /passenger-notify-item is-sent/);
  assert.doesNotMatch(page, /sent \? ' is-sent'/);
  assert.doesNotMatch(page, /label\('Sent', '已发送'\)/);
  assert.match(page, /passengerNotificationHtml\(row\)/);
});
