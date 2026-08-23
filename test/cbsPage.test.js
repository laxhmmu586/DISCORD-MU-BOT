const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'cbs.html'), 'utf8');
const pirForm = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'pir-form.html'), 'utf8');
const drive = fs.readFileSync(path.join(__dirname, '..', 'googleDrive.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('CBS page uses the Lake Baggage System browser title', () => {
  assert.match(page, /<title>Lake Baggage System<\/title>/);
  assert.doesNotMatch(page, /<title>CBS Cases<\/title>/);
});

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
  assert.match(drive, /!L1:M1`[\s\S]*CBS_UNRESOLVED_BAGGAGE_HEADERS\[12\]/);
  assert.match(server, /action === 'worldtracer'/);
});

test('completed On-hand cases move from Open Case to Closed Case', () => {
  assert.match(page, /new Set\(\['on-hand-rush', 'shipped', 'passenger-collected', 'case-close'\]\)/);
  assert.match(page, /const archived = Boolean\(row\.resolvedAt\) && archivedResolutions\.has\(String\(row\.resolution \|\| ''\)\.toLowerCase\(\)\)/);
  assert.match(page, /return showClosed \? archived : !archived/);
  assert.match(page, /onHandGroup\.hidden = false/);
  assert.match(page, /section === 'closed' \? 'Closed On-hand' : 'On-hand'/);
  assert.match(page, /renderUnresolvedBaggage\(window\._unresolvedBaggageSourceRows \|\| \[\]\)/);
  assert.match(server, /return res\.json\(\{ rows \}\)/);
  assert.doesNotMatch(server, /rows\.filter\(\(row\) => String\(row\.resolution \|\| ''\)\.toLowerCase\(\) !== 'on-hand-rush'/);
});

test('On-hand progress updates sync to the home-page baggage search', () => {
  assert.match(server, /async function syncOnHandStatusToBaggage\(record, action, body = \{\}\)/);
  for (const status of ['WorldTracer Updated', 'Reopened', 'Create Rush', 'Passenger Collected / Case Closed', 'Case Closed', 'Shipped', 'Other']) {
    assert.match(server, new RegExp(status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(server, /await updateTestBaggageRecord\(record\.bagTag, \{/);
  assert.match(server, /type: 'cbs'/);
  assert.equal((server.match(/await syncOnHandStatusToBaggage\(result\.record, action, req\.body\)/g) || []).length, 3);
  assert.match(drive, /else if \(updateType === 'cbs'\)/);
  assert.match(drive, /next\.status = sanitizeSheetText\(update\.status, 120\)/);
  assert.match(drive, /type: sanitizeSheetText\(update\.eventType, 80\) \|\| updateType/);
});

test('Other On-hand updates remain actionable in Open Case', () => {
  assert.match(page, /const active = row\.history\.find\(\(item\) => !item\.resolvedAt \|\| String\(item\.resolution \|\| ''\)\.toLowerCase\(\) === 'other'\)/);
  assert.match(page, /const formHtml = active/);
  assert.match(page, /<option value="other">Other resolution<\/option>/);
});

test('On-hand Case Close requires notes and archives the case', () => {
  assert.match(page, /<option value="case-close">Case Close<\/option>/);
  assert.match(page, /if \(action === 'case-close'\) return '<label class="wide"><span>Notes<\/span><textarea name="note" placeholder="Enter case close notes" required><\/textarea><\/label>'/);
  assert.match(server, /'passenger-collected', 'case-close', 'shipped'/);
  assert.match(server, /'case-close': 'Case Closed'/);
});

test('case progress identifies the staff member who made each update', () => {
  assert.match(page, /function currentUpdater\(\)/);
  assert.match(page, /payload\.updatedBy = currentUpdater\(\)/);
  assert.match(page, /Updated by: \$\{escapeHtml\(event\.by\)\}/);
  assert.match(page, /Updated by: \$\{escapeHtml\(item\.by\)\}/);
  assert.match(server, /updateFields\.updateEvent\.by = sanitizeCbsText\(req\.body\?\.updatedBy, 160\)/);
  assert.match(server, /Updated by: \$\{updatedBy\}/);
  assert.match(drive, /by: sanitizeSheetText\(fallback\.by \|\| event\.by, 160\)/);
  assert.match(drive, /'WorldTracer Updated By'/);
});

test('Closed On-hand cases can update WorldTracer or reopen', () => {
  assert.match(page, /<option value="worldtracer">Update WorldTracer<\/option><option value="reopen">Reopen<\/option>/);
  assert.match(page, /if \(action === 'reopen'\) return '<p class="muted wide">Reopen this case and return it to Open Case\.<\/p>'/);
  assert.match(page, /value="\$\{escapeHtml\(worldTracerFileNumber\)\}" required/);
  assert.match(server, /if \(action === 'reopen'\) \{/);
  assert.match(server, /reopenCbsUnresolvedBaggageCase\(req\.params\.rowNumber\)/);
  assert.match(drive, /async function reopenCbsUnresolvedBaggageCase\(rowNumber\)/);
  assert.match(drive, /!I\$\{target\.rowNumber\}:K\$\{target\.rowNumber\}/);
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

test('CBS tracking can request PVG open-bag authorization with the PDF form', () => {
  assert.match(page, /key:'open_bag_authorization_pvg', text:'Require Open Bag Authorization at PVG'/);
  assert.match(page, /The authorization form will be attached and emailed to the passenger/);
  assert.match(page, /PVG open-bag authorization email/);
  assert.match(server, /【需要您的授权】行李开箱检查通知/);
  assert.match(server, /Authorization Required for Baggage Inspection at PVG/);
  assert.match(server, /getCbsOpenBagAuthorizationPdf\(\)/);
  assert.match(server, /pdfBuffer: authorizationForm\.buffer/);
  assert.match(server, /filename: authorizationForm\.name/);
  assert.match(drive, /CBS_OPEN_BAG_AUTHORIZATION_FILE_ID \|\| ''/);
  assert.match(drive, /if \(!fileId\) throw new Error\('CBS_OPEN_BAG_AUTHORIZATION_FILE_ID is required\.'\)/);
  assert.doesNotMatch(drive, /CBS_OPEN_BAG_AUTHORIZATION_FILE_ID \|\| '[^']+'/);
  assert.match(drive, /drive\.files\.get\(\{ fileId, alt:'media' \}/);
  assert.doesNotMatch(server, /assets', 'Letter of Authorization\.pdf'/);
});

test('CBS Email stage sends a signed open-bag authorization PDF to PVG', () => {
  assert.match(page, /key:'email', text:'Email'/);
  assert.match(page, /Sent Open Bag Authorization to PVG/);
  assert.match(page, /authorization-upload-plus">\+<\/span>/);
  assert.match(page, /authorization-upload-title">Letter of Authorization<\/span>/);
  assert.match(page, /<span>Email To<\/span><select name="emailTo" required>/);
  assert.match(page, /pd-bag-intl@ceair\.com/);
  assert.match(page, /pd-bag-dom@ceair\.com/);
  assert.match(page, /accept="application\/pdf,\.pdf" required/);
  assert.match(page, /reader\.readAsDataURL\(file\)/);
  assert.match(page, /payload\.attachments = \[\{ filename:file\.name/);
  assert.match(server, /行李开箱检查授权文件 – WorldTracer \$\{fileNumber\}/);
  assert.match(server, /WorldTracer 案件编号：\$\{fileNumber\}/);
  assert.match(server, /行李牌号码：\$\{bagTag\}/);
  assert.match(server, /\['pd-bag-intl@ceair\.com', 'pd-bag-dom@ceair\.com'\]\.includes\(emailTo\)/);
  assert.match(server, /passengerEmail:emailTo/);
  assert.match(server, /attachments:emailAttachments/);
  assert.match(server, /A signed Letter of Authorization PDF is required/);
  assert.doesNotMatch(page.match(/const notifications = \[([\s\S]*?)\]\.filter/)?.[1] || '', /Signed authorization sent to PVG/);
  assert.match(page, /tracking-chip--email,\.tracking-chip--email\.is-latest/);
  assert.match(page, /event\.key === 'email' \? event\.title/);
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
  const passengerCaseShipping = page.match(/const shippingMethodSelect = '([^']+)'/)?.[1] || '';
  assert.match(page, /select name="shippingMethod" data-shipping-method required/);
  for (const method of ['ADC - All Day Courier', 'FedEx Delivery', 'Pick Up at Airport', 'Passenger Pay for Shipping']) assert.match(page, new RegExp(`<option>${method}<\\/option>`));
  assert.doesNotMatch(passengerCaseShipping, /<option>BDO<\/option>/);
  assert.match(page, /data-shipping-bdo/);
  assert.match(page, /name="bdo"/);
  assert.match(page, /data-shipping-tracking placeholder="Tracking number" disabled hidden/);
  assert.match(page, /needsTracking = shippingMethod\.value === 'FedEx Delivery'/);
  assert.match(page, /trackingInput\.required = needsTracking/);
  assert.match(page, /showsAddress = shippingMethod\.value === 'ADC - All Day Courier' \|\| shippingMethod\.value === 'FedEx Delivery'/);
  assert.doesNotMatch(page, /\['ADC - All Day Courier', 'FedEx Delivery', 'Passenger Pay for Shipping'\]\.includes/);
  assert.match(page, /addressInput\.required = false/);
  assert.match(page, /bdoInput\.required = showsAddress/);
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
