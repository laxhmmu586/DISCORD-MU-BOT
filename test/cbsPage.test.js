const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'cbs.html'), 'utf8');
const indexPage = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'index.html'), 'utf8');
const pirForm = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'pir-form.html'), 'utf8');
const drive = fs.readFileSync(path.join(__dirname, '..', 'googleDrive.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('CBS sidebar uses the MUBC brand', () => {
  assert.match(page, /<a class="brand" href="index\.html">MUBC<\/a>/);
  assert.doesNotMatch(page, /<a class="brand" href="index\.html">MUFC<\/a>/);
});

test('mobile CBS navigation spans the viewport without table content widening the page', () => {
  assert.match(page, /html,body\{max-width:100%;overflow-x:hidden\}/);
  assert.match(page, /header,body\.sidebar-collapsed header\{left:0;right:0;width:auto;max-width:100%\}/);
  assert.match(page, /\.page-tabs\{left:0;right:0;width:auto;max-width:100%;overscroll-behavior-x:contain\}/);
  assert.match(page, /\.wrap,\.card,\.open-case-group,\.sheet-shell\{min-width:0;max-width:100%\}/);
  assert.match(page, /\.sheet-shell \.cbs-sheet\{display:table;min-width:980px;overflow:visible\}/);
});

test('updating one CBS case keeps the complete case list visible', () => {
  assert.match(page, /window\._selectedCbsRow = 0;\s*window\._expandedCbsCases = window\._expandedCbsCases \|\| new Set\(\);\s*window\._expandedCbsCases\.add\(`row-\$\{rowNumber\}`\);\s*await loadCases\(\)/);
  assert.doesNotMatch(page, /window\._selectedCbsRow = Number\(rowNumber\)/);
});

test('CBS storage reads and writes Google Sheets only', () => {
  assert.match(page, /const identifier = row\.rowNumber \|\| ''/);
  assert.match(drive, /async function getCbsCases\(\) \{[\s\S]*getCbsSheetRows/);
  assert.match(drive, /async function getCbsUnresolvedBaggageCases[\s\S]*spreadsheets\.values\.get/);
  assert.match(drive, /async function getCbsWorldTracerCases[\s\S]*spreadsheets\.values\.get/);
  assert.match(drive, /async function getCbsMissingBagReports[\s\S]*getCbsMissingBagSheetRows/);
  assert.doesNotMatch(drive, /[Ff]irestore/);
});

test('Rush Bag storage refreshes the sheet title after a tab rename', () => {
  assert.match(drive, /async function getCbsWorldTracerSheetTitle\(\)[\s\S]*cbsWorldTracerSheetTitle = await resolveSheetTitleByGid/);
  assert.match(drive, /async function getCbsWorldTracerCases\(\) \{\s*const title = await getCbsWorldTracerSheetTitle\(\)/);
  assert.match(drive, /async function appendCbsWorldTracerCase\(record = \{\}\) \{\s*const title = await getCbsWorldTracerSheetTitle\(\)/);
  assert.match(drive, /async function updateCbsWorldTracerCase\(rowNumbers = \[\], record = \{\}\) \{\s*const title = await getCbsWorldTracerSheetTitle\(\)/);
});
test('public CBS forms do not CC the operations Gmail account', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  const wrongBaggageEmail = drive.match(/async function sendWrongBaggageCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.match(caseEmail, /const cc = \[\];/);
  assert.match(wrongBaggageEmail, /const cc = \[\];/);
  assert.doesNotMatch(caseEmail, /laxhmmu@gmail\.com/);
  assert.doesNotMatch(wrongBaggageEmail, /laxhmmu@gmail\.com/);
  assert.match(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.match(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('misconnection contact form acknowledgement does not CC the operations Gmail account', () => {
  const email = drive.match(/async function sendMisconnectionAssistanceEmail[\s\S]*?\n}/)?.[0] || '';
  assert.match(email, /const cc = \[\];/);
  assert.doesNotMatch(email, /laxhmmu@gmail\.com/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS Gmail sends are not aborted by a short client timeout', () => {
  const caseEmail = drive.match(/async function sendCbsCaseEmail[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(caseEmail, /CBS_EMAIL_TIMEOUT_MS/);
  assert.doesNotMatch(caseEmail, /gmail\.users\.messages\.send\([\s\S]*\{ timeout \}\)/);
});

test('CBS email updates explain an interrupted server connection instead of showing Failed to fetch', () => {
  assert.match(page, /The server connection was interrupted while sending the email/);
  assert.match(page, /check the case history before trying again/);
});

test('CBS page uses the Lake Baggage System browser title', () => {
  assert.match(page, /<title>Lake Baggage System<\/title>/);
  assert.doesNotMatch(page, /<title>CBS Cases<\/title>/);
});

test('CBS case refresh reads Google Sheets and does not restart the page', () => {
  assert.match(drive, /async function getCbsCases\(\) \{[\s\S]*getCbsSheetRows/);
  assert.match(page, /await Promise\.all\(\[loadCases\(\), loadMissingReports\(\), loadUnresolvedBaggage\(\)\]\)/);
  assert.doesNotMatch(page, /sidebarRefresh\.addEventListener\('click', \(\) => window\.location\.reload\(\)\)/);
});
test('CBS cases no longer rely on stale browser storage', () => {
  assert.doesNotMatch(page, /CASE_CACHE_KEY|readCaseCache|writeCaseCache/);
  assert.match(page, /async function loadCases\(\) \{\s*casesOutput\.innerHTML = '<p class="muted">Loading cases/);
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

test('On-hand only includes Office bags and excludes gate bags and Co-mail', () => {
  const description = 'Passenger bags entered as inbound and not-loaded outbound bags remain here until resolved. Gate bags and Co-mail are not included.';
  assert.equal((page.match(new RegExp(description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 2);
  assert.match(page, /<option>Gate bag<\/option>/);
  assert.match(page, /<option>Co-mail<\/option>/);
  assert.match(page, /<select name="location" required><option>Office<\/option><option>Transfer<\/option><\/select>/);
  assert.match(indexPage, /<option value="Office"><\/option><option value="Transfer"><\/option><option value="CBS"><\/option>/);
  assert.match(drive, /\.filter\(\(row\) => !isCbsOnHandExcludedBag\(row\)\)/);
  assert.match(drive, /if \(isCbsOnHandExcludedBag\(record\)\) return \{ created: false, excluded: true \};/);
  assert.match(drive, /new Set\(\['gate bag', 'co-mail'\]\)/);
  assert.match(drive, /location !== 'office'/);
  assert.match(drive, /\[record\.status, record\.bagType\][\s\S]*excludedTypes\.has/);
});

test('On-hand cases match the passenger case layout and support WorldTracer progress', () => {
  assert.match(page, /<th>WorldTracer File Number<\/th><th>Bag Tag<\/th><th>Direction<\/th>/);
  assert.match(page, /class="case-detail-layout"><div class="case-progress-column">\$\{unresolvedProgressHtml\(progressRow\)\}/);
  assert.match(page, /<option value="worldtracer">WorldTracer<\/option>/);
  assert.match(drive, /getCbsUnresolvedBaggageSheetTitle/);
  assert.match(page, /active\.rowNumber/);
  assert.match(drive, /rows\.find\(\(row\) => cbsRecordMatchesId\(row, rowNumber\)\)/);
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
  assert.equal((server.match(/await syncOnHandStatusToBaggage\(result\.record, action, req\.body\)/g) || []).length, 4);
  assert.match(drive, /else if \(updateType === 'cbs'\)/);
  assert.match(drive, /next\.status = sanitizeSheetText\(update\.status, 120\)/);
  assert.match(drive, /type: sanitizeSheetText\(update\.eventType, 80\) \|\| updateType/);
});

test('Other On-hand updates remain actionable in Open Case', () => {
  assert.match(page, /const active = row\.history\.find\(\(item\) => !item\.resolvedAt \|\| \['other', 'email'\]\.includes/);
  assert.match(page, /const formHtml = active/);
  assert.match(page, /<option value="other">Other resolution<\/option>/);
});

test('On-hand Case Close requires notes and archives the case', () => {
  assert.match(page, /<option value="case-close">Case Close<\/option>/);
  assert.match(page, /if \(action === 'case-close'\) return '<label class="wide"><span>Notes<\/span><textarea name="note" placeholder="Enter case close notes" required><\/textarea><\/label>'/);
  assert.match(server, /'passenger-collected', 'case-close', 'shipped'/);
  assert.match(server, /'case-close': 'Case Closed'/);
});

test('Passenger Collected closes an On-hand case without requiring notes', () => {
  assert.match(page, /if \(action === 'passenger-collected'\) return ''/);
  assert.doesNotMatch(page, /action === 'passenger-collected' \? 'Who collected the bag\?'/);
  assert.match(server, /let resolutionNote = action === 'passenger-collected' \? 'Passenger Collected \/ Case Closed' : note/);
  assert.match(server, /'passenger-collected': 'Passenger Collected \/ Case Closed'/);
  assert.match(server, /resolveCbsUnresolvedBaggageCase\(req\.params\.rowNumber, action, resolutionNote, updatedBy\)/);
});

test('case progress identifies the staff member who made each update', () => {
  assert.match(page, /function currentUpdater\(\)/);
  assert.match(page, /function updaterDisplayName\(value\)/);
  assert.match(page, /updater\.split\('@'\)\[0\]/);
  assert.match(page, /async function currentUpdater\(\)/);
  assert.match(page, /auth\.onAuthStateChanged\(\(nextUser\)/);
  assert.match(page, /return updaterDisplayName\(user\?\.email \|\| user\?\.displayName \|\| ''\)/);
  assert.match(page, /payload\.updatedBy = await currentUpdater\(\)/);
  assert.match(page, /if \(!payload\.updatedBy\) return alert\('Your signed-in account could not be identified/);
  assert.match(page, /Updated by: \$\{escapeHtml\(updaterDisplayName\(event\.by\)\)\}/);
  assert.match(page, /Updated by: \$\{escapeHtml\(updaterDisplayName\(item\.by\)\)\}/);
  assert.match(page, /escapeHtml\(updaterDisplayText\(item\.detail\)\)/);
  assert.match(page, /by: event\.by \|\| event\.updatedBy \|\| 'System'/);
  assert.match(page, /by:row\.submittedBy \|\| row\.createdBy \|\| 'System'/);
  assert.match(page, /by:row\.resolvedBy \|\| updaterFromText\(row\.resolutionNote\) \|\| 'System'/);
  assert.match(drive, /createdBy: sanitizeSheetText\(record\.submittedBy, 160\)/);
  assert.match(drive, /resolvedBy:sanitizeSheetText\(resolvedBy, 160\)/);
  assert.match(drive, /worldTracerUpdatedBy:sanitizeSheetText\(updatedBy, 160\)/);
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
  for (const method of ['ADC - All Day Courier', 'MBI DELIVERY AND STORAGE - STANDARD', 'BDO', 'FedEx Delivery', 'Pick Up at Airport', 'Passenger Pay for Shipping']) assert.match(onHandFields, new RegExp(method));
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

test('On-hand tags can be exchanged from Add On-hand and Resolution', () => {
  assert.match(page, /data-add-baggage-mode="exchange">Exchange/);
  assert.match(page, /const exchangeButton = '<button type="button" data-add-baggage-mode="exchange">Exchange<\/button>'/);
  assert.match(page, /direction === 'exchange'/);
  assert.match(page, /Select Current Open On-hand/);
  assert.match(page, /name="onHandRowNumber"/);
  assert.match(page, /newTagNumber[^>]+value="\$\{escapeHtml\(bagTag\)\}" readonly/);
  assert.match(page, /<option value="exchange">Exchange<\/option>/);
  assert.match(page, /name="newTagNumber"/);
  assert.match(page, /payload\.action = 'exchange'/);
  assert.match(page, /encodeURIComponent\(payload\.onHandRowNumber\)/);
  assert.match(server, /if \(action === 'exchange'\)/);
  assert.match(server, /exchangeCbsUnresolvedBaggageTag\(req\.params\.rowNumber, newTagNumber, updatedBy\)/);
});

test('On-hand exchange is saved to Google Sheets and shows old and new tags', () => {
  assert.match(drive, /'Exchange History'/);
  assert.match(drive, /async function exchangeCbsUnresolvedBaggageTag/);
  assert.match(drive, /Tag exchanged: \$\{target\.bagTag\} -> \$\{nextTag\}/);
  assert.match(drive, /JSON\.stringify\(exchangeHistory\)/);
  assert.match(page, /exchange-tag-old/);
  assert.match(page, /exchange-tag-new/);
  assert.match(page, /grid-template-columns:max-content 74px max-content/);
  assert.match(page, /exchange-tag-flow"><span class="exchange-tag-old">\$\{escapeHtml\(lastExchange\.oldTag\)\}<\/span><span class="exchange-tag-arrow"[^>]*>→/);
  assert.match(page, /exchange-tag-arrow-label">Exchange<\/span>/);
  assert.match(page, /<span class="exchange-tag-new">\$\{escapeHtml\(lastExchange\.newTag\)\}<\/span>/);
  assert.match(page, /\.exchange-tag-arrow::before,\.exchange-tag-arrow::after/);
  assert.match(page, /detail:`\$\{exchange\.oldTag\} → \$\{exchange\.newTag\}`/);
});

test('home Baggage add flow also supports On-hand Exchange', () => {
  assert.match(indexPage, /data-test-create-mode="exchange"/);
  assert.match(indexPage, /function renderTestExchangeForm\(newTag, rows = \[\]\)/);
  assert.match(indexPage, /async function renderTestAddChoice\(bagTag\)/);
  assert.match(indexPage, /const exchangeButton = `<button class="test-choice-card" type="button" data-test-create-mode="exchange">/);
  assert.match(indexPage, /Select current Open On-hand/);
  assert.match(indexPage, /data-test-exchange-form/);
  assert.match(indexPage, /submitTestExchange\(exchangeForm\)/);
  assert.match(indexPage, /action:"exchange", newTagNumber, updatedBy:currentUserName\(\)/);
  assert.match(server, /latestExchange\?\.oldTag \|\| record\.bagTag/);
  assert.match(drive, /next\.bagTag = newBagTag/);
});

test('Not load bags hides and disables Current location', () => {
  assert.match(indexPage, /data-test-outbound-location/);
  assert.match(indexPage, /const needsLocation = status !== "Not load bags"/);
  assert.match(indexPage, /locationInput\.disabled = !needsLocation/);
  assert.match(page, /data-add-outbound-location hidden/);
  assert.match(page, /const needsLocation = status\.value !== 'Not load bags'/);
  assert.match(page, /locationInput\.disabled = !needsLocation/);
});

test('home Baggage search avoids duplicate requests and repeated submissions', () => {
  assert.match(indexPage, /let testBagSearchPending = false/);
  assert.match(indexPage, /if \(!testOutput \|\| testBagSearchPending\) return/);
  assert.match(indexPage, /const data = await apiJson\(`\/test-baggage\/\$\{encodeURIComponent\(bagTag\)\}`\)/);
  const searchBody = indexPage.match(/async function searchTestBag\(event\) \{([\s\S]*?)\n      \}/)?.[1] || '';
  assert.doesNotMatch(searchBody, /cbs-unresolved-baggage/);
  assert.match(searchBody, /searchButton\.disabled = true/);
  assert.match(searchBody, /searchButton\.disabled = false/);
});

test('Baggage creation returns a clear retry response for Sheets quota limits', () => {
  assert.match(server, /err\?\.code === 429 \|\| \/quota exceeded\|rate limit\/i/);
  assert.match(server, /res\.set\('Retry-After', '60'\)/);
  assert.match(server, /Google Sheets is temporarily busy\. Please wait 60 seconds and submit again\./);
});

test('home Baggage Update menu supports Exchange', () => {
  assert.match(indexPage, /data-test-update-mode="exchange"/);
  assert.match(indexPage, /<button type="button" data-test-update-mode="exchange" class="\$\{activeMode === "exchange"/);
  assert.match(indexPage, /activeMode === "exchange"/);
  assert.match(indexPage, /field\("New tag number", "newTagNumber"/);
  assert.match(indexPage, /test-exchange-old.*record\.bagTag/);
  assert.match(indexPage, /test-exchange-arrow-label">Exchange/);
  assert.match(indexPage, /if \(mode === "exchange"\)/);
  assert.match(indexPage, /This bag does not have an Open On-hand case/);
  assert.match(indexPage, /action:"exchange", newTagNumber, updatedBy:currentUserName\(\)/);
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

test('CBS tracking requests PVG open-bag authorization from Email', () => {
  assert.doesNotMatch(page, /key:'open_bag_authorization_pvg', text:'Require Open Bag Authorization at PVG'/);
  assert.match(page, /value="require_open_bag_authorization_pvg">Require Open Bag Authorization at PVG/);
  assert.match(page, /PVG open-bag authorization email/);
  assert.match(server, /【需要您的授权】行李开箱检查通知/);
  assert.match(server, /Authorization Required for Baggage Inspection at PVG/);
  assert.match(server, /getCbsOpenBagAuthorizationPdf\(\)/);
  assert.match(server, /pdfBuffer:\s*authorizationForm\.buffer/);
  assert.match(server, /filename:\s*authorizationForm\.name/);
  assert.match(drive, /const defaultFileId = \['1Nfs3j7DcXYe', 'zPgcyKz894P', 'X8nNX3-GrA'\]\.join\(''\)/);
  assert.match(drive, /CBS_OPEN_BAG_AUTHORIZATION_FILE_ID \|\| defaultFileId/);
  assert.doesNotMatch(drive, /CBS_OPEN_BAG_AUTHORIZATION_FILE_ID is required/);
  assert.match(drive, /drive\.files\.get\(\{ fileId, alt:'media' \}/);
  assert.doesNotMatch(server, /assets', 'Letter of Authorization\.pdf'/);
});

test('CBS Email stage sends a signed open-bag authorization file to PVG', () => {
  assert.match(page, /key:'email', text:'Email'/);
  assert.match(page, /Sent Open Bag Authorization to PVG/);
  assert.match(page, /authorization-upload-plus">\+<\/span>/);
  assert.match(page, /authorization-upload-title">Letter of Authorization<\/span>/);
  assert.match(page, /\[data-pvg-email-field\]\[hidden\],\[data-email-eta-field\]\[hidden\] \{ display:none; \}/);
  assert.match(page, /<span>Email To<\/span><select name="emailTo" required>/);
  assert.match(page, /pd-bag-intl@ceair\.com/);
  assert.match(page, /pd-bag-dom@ceair\.com/);
  assert.doesNotMatch(page, /accept="application\/pdf,\.pdf"/);
  assert.match(page, /Select the signed file/);
  assert.match(page, /reader\.readAsDataURL\(file\)/);
  assert.match(page, /payload\.attachments = \[\{ filename:file\.name/);
  assert.match(page, /mimeType:file\.type \|\| 'application\/octet-stream'/);
  assert.doesNotMatch(page, /const file = form\.elements\.authorizationFile/);
  assert.match(server, /attachments\.length !== 1/);
  assert.doesNotMatch(server, /attachments\[0\]\.mimeType !== 'application\/pdf'/);
  assert.match(server, /行李开箱检查授权文件 – WorldTracer \$\{fileNumber\}/);
  assert.match(server, /WorldTracer 案件编号：\$\{fileNumber\}/);
  assert.match(server, /行李牌号码：\$\{bagTag\}/);
  assert.match(server, /\['pd-bag-intl@ceair\.com', 'pd-bag-dom@ceair\.com'\]\.includes\(emailTo\)/);
  assert.match(server, /passengerEmail:emailTo/);
  assert.match(server, /attachments:emailAttachments/);
  assert.match(server, /A signed Letter of Authorization attachment is required/);
  assert.doesNotMatch(page.match(/const notifications = \[([\s\S]*?)\]\.filter/)?.[1] || '', /Signed authorization sent to PVG/);
  assert.match(page, /tracking-chip--email,\.tracking-chip--email\.is-latest/);
  assert.match(page, /event\.key === 'email' \? event\.title/);
  assert.match(page, /case-update\[data-update-mode="email"\] \{ grid-template-columns:minmax\(240px,420px\); \}/);
});

test('CBS form accepts optimized attachments and Discord posts them in batches', () => {
  assert.match(pirForm, /up to 4 files under Others \(22 MB total after photo optimization\)/);
  assert.match(pirForm, /if \(selectedCount > 20\)/);
  assert.match(pirForm, /if \(totalBytes > 22 \* 1024 \* 1024\)/);
  assert.match(pirForm, /try \{\s*payload\.attachments = await collectRequiredAttachments\(\)/);
  assert.match(server, /const maxAttachments = 20/);
  assert.match(server, /body\.attachments\.length > 20/);
  assert.match(server, /index \+= 10/);
  assert.match(server, /files: batches\[index\]/);
});

test('CBS form falls back to the original file when Safari cannot optimize an image', () => {
  assert.match(pirForm, /function fileToDataUrl\(file\)/);
  assert.match(pirForm, /imageFileToDataUrl\(file\)\.then\(\(result\) => \{/);
  assert.match(pirForm, /\}, \(\) => fileToDataUrl\(file\)\)/);
  assert.match(pirForm, /const mimeType = optimized \? 'image\/jpeg' : \(file\.type \|\| 'application\/octet-stream'\)/);
});

test('CBS form recognizes Safari Load failed as an interrupted request', () => {
  assert.match(pirForm, /failed to fetch\|load failed\|network request failed/);
});

test('CBS case creation sends email and Discord attachments in parallel', () => {
  assert.match(server, /const emailDelivery = sendCbsCaseEmail/);
  assert.match(server, /const discordDelivery = sendCbsAttachmentsToDiscord/);
  assert.match(server, /Promise\.all\(\[emailDelivery, discordDelivery\]\)/);
  assert.match(server, /CBS_CREATE_DELIVERY_WAIT_MS/);
  assert.match(server, /deliveryPending/);
  assert.match(pirForm, /Attachments are still being delivered/);
});

test('CBS tracking moves the baggage transfer ETA update under Email', () => {
  assert.doesNotMatch(page, /key:'information', text:'Information'/);
  assert.doesNotMatch(page, /name="informationType"/);
  assert.match(page, /value="baggage_transfer_status_eta">Baggage transfer status update - ETA/);
  assert.match(page, /name="estimatedArrivalTime" type="date" disabled required/);
  assert.match(page, /data-email-eta-field/);
  assert.doesNotMatch(page, /data-update-mode="information"/);
  assert.match(page, /Baggage transfer status update - ETA email/);
  assert.match(server, /emailAction === 'baggage_transfer_status_eta'/);
  assert.match(server, /updateEvent:\{ key:'email', title:'Baggage transfer status update - ETA'/);
});

test('CBS Email no longer offers the address confirmation request', () => {
  assert.doesNotMatch(page, /value="address_confirm_request">Address Confirm Request Email/);
  assert.match(server, /function addressConfirmRequestEmail\(record = \{\}\)/);
  assert.match(server, /Baggage Pick-Up \/ Delivery Address Confirmation – WorldTracer/);
  assert.match(server, /行李领取 \/ 配送地址确认 – WorldTracer/);
  assert.match(server, /Delivery to the Address on File/);
  assert.match(server, /配送至报失记录中的地址/);
  assert.match(server, /If we do not receive a response from you/);
  assert.match(server, /如果我们未收到您的回复/);
  assert.match(server, /emailAction === 'address_confirm_request'/);
  assert.match(server, /addressConfirmRequestEmail\(record\)/);
});

test('CBS Email offers baggage pickup or delivery method confirmation in all three entries', () => {
  assert.equal((page.match(/value="baggage_pickup_delivery_method_confirmation"/g) || []).length, 3);
  assert.match(page, /Baggage Pick-Up \/ Delivery Method Confirmation/);
  assert.match(server, /function baggagePickupDeliveryMethodConfirmationEmail\(record = \{\}\)/);
  assert.match(server, /Baggage Pick-Up \/ Delivery Method Confirmation – WorldTracer \$\{fileNumber\}/);
  assert.match(server, /行李领取 \/ 寄送方式确认 – WorldTracer \$\{fileNumber\}/);
  assert.match(server, /Before your baggage becomes available, we would like to confirm your preferred method/);
  assert.match(server, /Please select one of the following options/);
  assert.match(server, /You will pick up your baggage in person at Los Angeles International Airport \(LAX\)/);
  assert.match(server, /在您的行李可以领取或配送之前，我们希望提前确认您希望采用哪种方式接收行李/);
  assert.match(server, /请选择以下其中一种方式/);
  assert.match(server, /您将自行前往洛杉矶国际机场（LAX）领取行李/);
  assert.match(server, /您希望我们将行李配送至您在行李报失记录（Report）中提供的地址/);
  assert.match(server, /If we do not receive a response from you, we will proceed with delivery/);
  assert.match(server, /如果我们未收到您的回复，我们将默认按照您在行李报失记录（Report）中提供的地址安排配送/);
  assert.match(server, /baggagePickupDeliveryMethodConfirmationEmail\(record\)/);
  assert.match(server, /baggagePickupDeliveryMethodConfirmationEmail\(emailRecord\)/);
});

test('changing Current Stage replaces the form with fields for that stage', () => {
  assert.match(page, /const controls = select\.closest\('\.case-detail-right'\) \|\| select\.closest\('\.tracking-workspace'\)/);
  assert.match(page, /form\.dataset\.updateMode = select\.value/);
  assert.match(page, /fields\.innerHTML = inlineUpdateFieldsHtml\(select\.value, \{ event:form\.dataset\.hasUpcomingRush/);
  assert.match(page, /if \(key === 'worldtracer'\) return input\('File number', 'fileNumber'\)/);
  assert.doesNotMatch(page, /if \(key === 'information'\)/);
  assert.match(page, /if \(key === 'requested_bags'\) return input\('From which station\?', 'fromStation'\)/);
  assert.match(page, /if \(key === 'shipping'\) return \[shippingMethodSelect/);
  assert.doesNotMatch(page, /input\('AKE number\?', 'akeNumber'\)/);
});

test('Upcoming Rush updates populate the Passenger Filed summary', () => {
  assert.match(page, /requested_bags', text:'Requested Bags'[\s\S]*upcoming_rush', text:'Upcoming Rush'/);
  assert.match(page, /name="rushFlight" value="\$\{escapeHtml\(values\.rushFlight \|\| 'MU583'\)\}"[\s\S]*name="rushDate" type="date"[\s\S]*name="rushTagNumber"[\s\S]*required/);
  assert.match(server, /type === 'upcoming_rush'[\s\S]*Rush Flight[\s\S]*Rush Date[\s\S]*Rush Tag/);
  assert.match(page, /showUpcomingRush = rows\.some[\s\S]*showUpcomingRush \? '<th class="rush-date-heading">Rush Flight \/ Date<\/th><th>Rush Tag<\/th>' : ''/);
  assert.match(page, /const bagTagColumn = showUpcomingRush \? '<col style="width:180px">' : '<col>'/);
  assert.match(page, /item\.key === 'upcoming_rush'/);
  assert.match(page, /rushDate === todayKey \? '<span class="rush-today">Today<\/span>' : ''/);
  assert.match(page, /grid-template-columns:44px auto/);
  assert.match(page, /case-summary-row td \{ vertical-align:middle/);
  assert.match(page, /rush-tag-summary,\.on-hand-tag-summary \{ display:inline-flex; align-items:center; min-height:29px/);
  assert.match(page, /rush-date-heading \{ padding-left:64px !important/);
  assert.match(page, /class="rush-today-slot">\$\{rushToday\}<\/span><span>\$\{escapeHtml/);
  assert.match(page, /@keyframes rush-today-hop/);
  assert.match(page, /replace\(\/\^\(\[A-Z\]\{2\}\)\\s\*\(\\d\+\)\$\/i, '\$1 \$2'\)/);
  assert.match(page, /formattedFlight\}\/ \$\{formattedDate\}/);
  assert.match(page, /class="danger delete-upcoming-rush"[\s\S]*value="upcoming_rush_delete" formnovalidate>Delete Upcoming Rush/);
  assert.match(page, /button\.delete-upcoming-rush \{ grid-column:2/);
  assert.match(server, /deleteEventKey:'upcoming_rush'/);
  assert.match(drive, /currentEvents\.filter\(\(event\) => event\.key !== \(update\.replaceEventKey \|\| update\.deleteEventKey\)\)/);
});

test('Upcoming Rush updates notify the operations Discord channel', () => {
  assert.match(server, /CBS_UPCOMING_RUSH_DISCORD_CHANNEL_ID = process\.env\.CBS_UPCOMING_RUSH_DISCORD_CHANNEL_ID \|\| '1252032351131799654'/);
  assert.match(server, /async function sendUpcomingRushToDiscord\(record, updateEvent\)/);
  for (const field of ['Passenger', 'WorldTracer', 'Original bag tag', 'Rush flight', 'Rush date', 'Rush tag']) {
    assert.ok(server.includes(`\`${field}:`), field);
  }
  assert.doesNotMatch(server.match(/async function sendUpcomingRushToDiscord[\s\S]*?\n\}/)?.[0] || '', /Updated by:/);
  assert.match(server, /updateFields\.updateEvent\?\.key === 'upcoming_rush'[\s\S]*sendUpcomingRushToDiscord\(result\.record, updateFields\.updateEvent\)/);
  assert.match(server, /CBS Upcoming Rush Discord notification error/);
});

test('Rush Bag cases with MU586 notify Discord and treat WorldTracer as optional', () => {
  assert.match(server, /CBS_RUSH_BAG_DISCORD_CHANNEL_ID = process\.env\.CBS_RUSH_BAG_DISCORD_CHANNEL_ID \|\| '1252033117280010291'/);
  const sender = server.match(/async function sendRushBagToDiscord[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(sender, /if \(!worldTracerFileNumber\)/);
  assert.match(sender, /\.\.\.\(worldTracerFileNumber \? \[`WorldTracer File Number:/);
  assert.match(sender, /flightNumber[\s\S]*=== 'MU586'/);
  assert.match(sender, /Original Tag Number:/);
  assert.match(sender, /RUSH Tag Number:/);
  assert.match(sender, /RUSH Itinerary:/);
  assert.doesNotMatch(sender, /Updated by|updatedBy|employee/i);
  assert.match(server, /appendCbsWorldTracerCase\(record\)[\s\S]*addRushBagDiscordResult\(\{ created: true, record: saved \}, saved\)/);
  assert.match(server, /isRushBagWorldTracerOnlyUpdate\(previousRecord, result\.record\)[\s\S]*WorldTracer file number-only updates do not send another Rush Bag notification/);
  assert.match(server, /updateCbsWorldTracerCase\(body\.rowNumbers, record\)[\s\S]*addRushBagDiscordResult\(result, result\.record\)/);
});

test('Missing Bag Report shows the LAXTEC phone contact', () => {
  assert.match(page, /class="missing-report-contact" href="tel:\+14243121860"/);
  assert.match(page, /LAXTEC: 424-312-1860/);
  assert.match(page, /aria-label="Call LAXTEC at 424-312-1860"/);
});

test('Passenger Filed displays multiple bag tags on separate lines', () => {
  assert.match(page, /function bagTagSummaryHtml\(value\)/);
  assert.match(page, /split\(\/\\s\*\\\/\\s\*\/\)/);
  assert.match(page, /class="bag-tag-list">\$\{tags\.map\(\(tag\) => `<span class="bag-tag-value">/);
  assert.match(page, /<td class="sheet-meta">\$\{bagTagSummaryHtml\(displayBagTag\(row\)\)\}<\/td>/);
  assert.match(page, /\.bag-tag-list \{ display:inline-grid; gap:5px/);
});

test('Upcoming Rush matches can link and close an On-hand case', () => {
  assert.match(page, /function normalizedRushTag[\s\S]*replace\(\/\[\\s-\]\+\/g, ''\)/);
  assert.match(page, /matchingOnHandForCase[\s\S]*normalizedRushTag\(item\.bagTag\) === tag/);
  assert.match(page, /matchingPassengerCaseForOnHand[\s\S]*normalizedRushTag\(upcomingRushDetails\(item\)\.rushTag\) === tag/);
  assert.match(page, /if \(window\._unresolvedBaggageLoaded\) renderUnresolvedBaggage\(window\._unresolvedBaggageSourceRows \|\| \[\]\)/);
  assert.match(page, /class="rush-match on-hand-match">Match<\/span>/);
  assert.match(page, /<span class="on-hand-tag-summary">\$\{matchBadge\}<span class="bag-tag-value">/);
  assert.match(page, /<col style="width:190px"><col style="width:200px"><col style="width:120px">/);
  assert.match(page, /data-link-on-hand=[\s\S]*data-link-case=/);
  assert.match(page, /\/link-on-hand`[\s\S]*onHandId:link\.dataset\.linkOnHand/);
  assert.match(server, /syncUpcomingRushOnHand[\s\S]*updateCbsUnresolvedBaggageWorldTracer/);
  assert.match(server, /app\.get\('\/cbs-unresolved-baggage'[\s\S]*matchedCase[\s\S]*Upcoming Rush match/);
  assert.match(server, /app\.post\('\/cbs-cases\/:rowNumber\/link-on-hand'[\s\S]*linked-passenger-file[\s\S]*key:'on_hand_match'/);
  assert.match(page, /'linked-passenger-file'/);
});

test('Current Stage comments appear in an orange progress node and above Notify Passenger', () => {
  assert.match(page, /\{ key:'comment', text:'Comment' \}/);
  assert.match(page, /if \(key === 'comment'\) return '<select name="commentPreset" data-comment-preset>/);
  assert.match(page, /Passenger-related issue\. Self-pickup or delivery at passenger’s expense\./);
  assert.match(page, /<option value="Passenger request Pick up at LAX">Passenger request Pick up at LAX<\/option>/);
  assert.match(page, /<textarea name="comment" placeholder="Write a comment" required><\/textarea>'/);
  assert.match(page, /if \(commentPreset\.value && comment\) comment\.value = commentPreset\.value/);
  assert.match(page, /tracking-chip--comment,\.tracking-chip--comment\.is-latest/);
  assert.match(page, /tracking-chip--comment[^\n]*background:#fffaeb[^\n]*color:#b54708[^\n]*#f79009/);
  assert.match(page, /\.case-comments \{[^\n]*border:1px solid #fedf89[^\n]*background:#fffaeb/);
  assert.match(page, /function caseCommentsHtml\(row\)/);
  assert.match(page, /class="case-comment"[\s\S]*Comment by/);
  assert.match(page, /\$\{trackingControlHtml\(row, 'current'\)\}\$\{caseCommentsHtml\(row\)\}<div class="case-detail-content">\$\{detailHtml\}<\/div>/);
  assert.match(server, /updateEvent:\{ key:'comment', title:'Comment', fields:\[\['Comment', comment\]\] \}/);
});

test('each Passenger Filed comment can be deleted independently', () => {
  assert.match(page, /data-delete-case-comment/);
  assert.match(page, /data-comment-at="\$\{escapeHtml\(event\.at \|\| ''\)\}"/);
  assert.match(page, /data-comment-text="\$\{escapeHtml\(comment\)\}"/);
  assert.match(page, /Delete this comment\?/);
  assert.match(page, /\/cbs-cases\/\$\{encodeURIComponent\(caseId\)\}\/comments\/delete/);
  assert.match(server, /app\.post\('\/cbs-cases\/:rowNumber\/comments\/delete'/);
  assert.match(server, /deleteCbsCaseComment\(req\.params\.rowNumber, \{ at, comment \}\)/);
  assert.match(drive, /async function deleteCbsCaseComment\(rowNumber, target = \{\}\)/);
  assert.match(drive, /event\.key === 'comment' && event\.at === targetAt && comment === targetComment/);
  assert.match(drive, /currentEvents\.filter\(\(_, index\) => index !== eventIndex\)/);
  assert.match(drive, /spreadsheets\.values\.update/);
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
  assert.match(page, /\$\{caseCommentsHtml\(row\)\}<div class="case-detail-content">\$\{detailHtml\}<\/div>\$\{passengerNotificationHtml\(row\)\}/);
});

test('repeated copies of the same email share one progress stage', () => {
  assert.match(page, /function groupRepeatedEmailEvents\(events\)/);
  assert.match(page, /event\.key === 'email'.*group\.event\.key === 'email' && group\.event\.title === event\.title/);
  assert.match(page, /existing\.repeats\.push\(event\)/);
  assert.match(page, /groupRepeatedEmailEvents\(events/);
  assert.match(page, /repeatIndex \+ 2/);
  assert.match(page, /email sent/);
  assert.match(page, /第 \$\{ordinal\} 封邮件发送时间/);
  assert.match(page, /tracking-chip-repeat/);
});

test('Sent Open Bag Authorization to PVG uses a pale yellow outlined progress stage', () => {
  assert.match(page, /event\.title === 'Sent Open Bag Authorization to PVG' \? ' tracking-chip--email-sent-pvg'/);
  assert.match(page, /\.tracking-chip--email-sent-pvg,\.tracking-chip--email-sent-pvg\.is-latest \{[^}]*background:#fffbe8; color:#8a5a00; box-shadow:inset 0 0 0 2px #f5c451/);
  assert.match(page, /\.tracking-chip--email-sent-pvg \.tracking-step-number,\.tracking-chip--email-sent-pvg\.is-latest \.tracking-step-number \{ background:#d99a00; \}/);
  assert.match(page, /\.tracking-chip--email-sent-pvg \.tracking-chip-title \{ color:#8a5a00; \}/);
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
  for (const method of ['ADC - All Day Courier', 'MBI DELIVERY AND STORAGE - STANDARD', 'FedEx Delivery', 'Pick Up at Airport', 'Passenger Pay for Shipping']) assert.match(page, new RegExp(`<option>${method}<\\/option>`));
  assert.doesNotMatch(passengerCaseShipping, /<option>BDO<\/option>/);
  assert.match(page, /data-shipping-bdo/);
  assert.match(page, /name="bdo"/);
  assert.match(page, /data-shipping-tracking placeholder="Tracking number" disabled hidden/);
  assert.match(page, /needsTracking = shippingMethod\.value === 'FedEx Delivery'/);
  assert.match(page, /trackingInput\.required = needsTracking/);
  assert.match(page, /showsAddress = \['ADC - All Day Courier', 'MBI DELIVERY AND STORAGE - STANDARD', 'FedEx Delivery'\]\.includes\(shippingMethod\.value\)/);
  assert.doesNotMatch(page, /\['ADC - All Day Courier', 'MBI DELIVERY AND STORAGE - STANDARD', 'FedEx Delivery', 'Passenger Pay for Shipping'\]\.includes/);
  assert.match(page, /addressInput\.required = false/);
  assert.match(page, /bdoInput\.required = showsAddress/);
});

test('Passenger Filed shipping automatically closes the case after recording shipping', () => {
  assert.match(server, /status: airportPickup \? 'Closed - Pick Up at Airport' : 'Closed - Shipping'/);
  assert.match(server, /followUpEvent: \{ key:'closed', title:'Case Closed', fields:\[\['Comment', 'shipped'\]\] \}/);
  assert.match(server, /if \(updateFields\?\.followUpEvent\) updateFields\.followUpEvent\.by/);
  assert.match(drive, /const appendedEvents = followUpEvent \? \[historyEvent, followUpEvent\] : \[historyEvent\]/);
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

test('PIR form limits Others attachments to 4 on the client and server', () => {
  assert.match(pirForm, /data-attachment-type="other" data-max-attachments="4"/);
  assert.match(pirForm, /You may upload up to 4 files under Others/);
  assert.match(server, /if \(otherAttachmentCount > 4\)/);
  assert.match(server, /Use no more than 4 Others attachments\./);
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


test('Email can notify a Passenger Filed case that baggage is ready for LAX pickup', () => {
  assert.match(page, /<option value="contact_pax_pickup_bags">Pick-up Bags - available<\/option>/);
  assert.match(page, /payload\.emailAction === 'sent_open_bag_authorization_to_pvg'/);
  assert.match(page, /data-pvg-email-field/);
  assert.match(server, /您的行李已可在洛杉矶机场领取 - 中国东方航空公司/);
  assert.match(server, /Your Baggage Available for Pick-Up at LAX - China Eastern Airlines/);
  assert.match(server, /Tom Bradley International Terminal（TBIT）A68 柜台办公室/);
  assert.match(server, /Pick-up Hours: 8:00 AM – 2:00 PM/);
  assert.match(server, /pickupEmail \|\| futurePickupEmail \|\| transferEtaEmail \|\| addressConfirmEmail \|\| pickupDeliveryMethodEmail \|\| requirePvgAuthorizationEmail \? record\.email/);
  assert.match(page, /'Pick-up Bags - available', 'Pick-up Bags - future available'/);
  assert.match(page, /const pickupBagsEmail = event\.key === 'email' && \['Pick-up Bags - available', 'Pick-up Bags - future available'\]\.includes\(event\.title\)/);
  assert.match(page, /pickupBagsEmail \? 'Pick-up Bags Email Sent'/);
});

test('On-hand Email asks for a recipient and sends the pickup notice there', () => {
  assert.match(page, /<option value="email">Email<\/option>/);
  assert.match(page, /if \(action === 'email'\) return .*Pick-up Bags - available/);
  assert.match(page, /<span>Email To<\/span><input name="emailTo" type="email"/);
  assert.match(server, /if \(action === 'email'\) \{/);
  assert.match(server, /if \(!isValidEmail\(emailTo\)\)/);
  assert.match(server, /sendCbsCaseEmail\(\{ passengerEmail:emailTo/);
  assert.match(server, /resolveCbsUnresolvedBaggageCase\(req\.params\.rowNumber, action, resolutionNote, updatedBy\)/);
});

test('sidebar Email sends either a signed PVG authorization or a passenger pickup notice', () => {
  assert.match(page, /id="missing-report-alert"[\s\S]*id="email-tab"[\s\S]*id="baggage-chart-tab"/);
  assert.match(page, /id="standalone-email-form"/);
  assert.match(page, /Sent Open Bag Authorization to PVG[\s\S]*Pick-up Bags - available/);
  assert.match(page, /pd-bag-intl@ceair\.com[\s\S]*pd-bag-dom@ceair\.com/);
  assert.match(page, /name="authorizationFile" type="file" required/);
  assert.match(page, /name="passengerEmail" type="email" placeholder="Passenger email address"/);
  assert.match(page, /label\[hidden\] \{ display:none !important; \}/);
  assert.match(page, /fetch\(`\$\{apiBase\}\/cbs-email`/);
  assert.match(server, /app\.post\('\/cbs-email'/);
  assert.match(server, /signedOpenBagAuthorizationToPvgEmail\(\{\}\)/);
  assert.match(server, /baggagePickupAtLaxEmail\(\{\}\)/);
});

test('CBS removes the passenger-related pickup option from Comment and Email menus', () => {
  assert.doesNotMatch(page, /value="passenger_related_pickup_or_fedex"/);
  assert.doesNotMatch(page, /<option value="Passenger-related issue\. Self-pickup or delivery at passenger’s expense\.">/);
  assert.doesNotMatch(server, /passenger_related_pickup_or_fedex/);
  assert.doesNotMatch(server, /function passengerRelatedPickupOrFedexEmail/);
});

test('standalone, Passenger Filed, and On-hand Email menus stay synchronized', () => {
  for (const action of ['sent_open_bag_authorization_to_pvg', 'contact_pax_pickup_bags', 'pickup_bags_future_available', 'baggage_transfer_status_eta', 'baggage_pickup_delivery_method_confirmation', 'require_open_bag_authorization_pvg']) {
    assert.equal((page.match(new RegExp(`value="${action}"`, 'g')) || []).length, 3, `${action} should appear in all three Email menus`);
  }
  assert.doesNotMatch(page, /\{ key:'open_bag_authorization_pvg'/);
  assert.doesNotMatch(server, /type === 'open_bag_authorization_pvg'/);
});

test('Email menus offer the bilingual baggage inspection explanation', () => {
  assert.equal((page.match(/<option value="baggage_open_by_customs">Explanation - Baggage Open by Custom<\/option>/g) || []).length, 3);
  assert.match(server, /function baggageInspectionExplanationEmail\(record = \{\}\)/);
  assert.match(server, /Explanation Regarding Baggage Inspection/);
  assert.match(server, /关于行李可能被开箱检查的说明/);
  assert.match(server, /U\.S\. Customs and Border Protection upon arrival in the United States/);
  assert.match(server, /美国海关及边境保护局（U\.S\. Customs and Border Protection）/);
  assert.match(server, /emailAction === 'baggage_open_by_customs'/);
  assert.match(server, /needsWorldTracer = !\['sent_open_bag_authorization_to_pvg', 'contact_pax_pickup_bags', 'baggage_open_by_customs'\]/);
});

test('future pickup email requires an available date in all three Email forms', () => {
  assert.equal((page.match(/value="pickup_bags_future_available"/g) || []).length, 3);
  assert.match(page, /name="availableDate" type="date"/);
  assert.doesNotMatch(page, /name="emailBody"/);
  assert.doesNotMatch(server, /emailBody|withEditableCbsEmailBody|sanitizeCbsEmailBody/);
  assert.match(server, /function baggageFuturePickupAtLaxEmail/);
  assert.match(server, /Baggage Pick-Up Notice – WorldTracer \$\{fileNumber\}/);
  assert.match(server, /行李领取通知 – WorldTracer \$\{fileNumber\}/);
  assert.match(page, /label\[hidden\] \{ display:none !important; \}/);
});

test('Email forms keep Language below all conditional detail fields', () => {
  const standaloneForm = page.match(/<form class="worldtracer-form" id="standalone-email-form">([\s\S]*?)<\/form>/)?.[1] || '';
  assert.ok(standaloneForm.indexOf('Estimated arrival date') < standaloneForm.indexOf('<span>Language</span>'));
  const onHandFields = page.match(/if \(action === 'email'\) return `([\s\S]*?)`;/)?.[1] || '';
  assert.ok(onHandFields.indexOf('Estimated arrival date') < onHandFields.indexOf('<span>Language</span>'));
});

test('PVG inspection authorization email includes the WorldTracer reference', () => {
  const template = server.match(/function openBagAuthorizationPvgEmail\(record\)[\s\S]*?\n}/)?.[0] || '';
  assert.match(template, /WorldTracer \$\{fileNumber\}/);
  assert.match(template, /WorldTracer 案件编号：\$\{fileNumber\}/);
  assert.match(template, /WorldTracer Reference Number: \$\{fileNumber\}/);
});

test('Add On-hand records the signed-in account as creator', () => {
  assert.match(page, /payload\.submittedBy = await currentUpdater\(\)/);
  assert.match(drive, /createdBy: sanitizeSheetText\(record\.submittedBy, 160\)/);
});
