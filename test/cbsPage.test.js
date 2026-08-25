const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'cbs.html'), 'utf8');
const pirForm = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'pir-form.html'), 'utf8');
const drive = fs.readFileSync(path.join(__dirname, '..', 'googleDrive.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const firestore = fs.readFileSync(path.join(__dirname, '..', 'cbsFirestore.js'), 'utf8');

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

test('Missing Bag Report acknowledgement uses the proxy-safe collection endpoint', () => {
  assert.match(page, /const identifier = row\.rowNumber \|\| row\.firestoreId \|\| ''/);
  assert.match(page, /body:JSON\.stringify\(\{ action:'acknowledge', identifier:rowNumber \}\)/);
  assert.match(page, /createButton \? `\/cbs-missing-bags\/\$\{encodeURIComponent\(rowNumber\)\}\/create-case` : '\/cbs-missing-bags'/);
  assert.doesNotMatch(page, /\$\{encodeURIComponent\(rowNumber\)\}\/\$\{action\}/);
  assert.match(server, /app\.post\('\/cbs-missing-bags',[\s\S]*action !== 'acknowledge'[\s\S]*acknowledgeCbsMissingBag\(identifier\)/);
  assert.match(drive, /firestoreRows\.find\(\(row\) => cbsRecordMatchesId\(row, identifier\)\)/);
  assert.match(drive, /saveCbsFirestoreRecord\('cbsMissingBagReports', next\)[\s\S]*acknowledgement Sheet backup failed/);
});

test('Firestore is the CBS read store without automatic Sheet migration', () => {
  for (const collection of ['cbsCases', 'cbsOnHandCases', 'cbsWorldTracerCases', 'cbsMissingBagReports', 'cbsWrongBaggageCases']) {
    assert.match(drive, new RegExp(`cbsFirestore\\.list\\('${collection}'\\)`));
  }
  assert.doesNotMatch(drive, /ensureMigrated/);
  assert.match(firestore, /CBS_FIRESTORE_ENABLED \|\| 'true'/);
  assert.doesNotMatch(firestore, /_cbsMigrations|legacyLoader/);
  assert.match(drive, /saveCbsFirestoreRecord\('cbsCases', record\)/);
  assert.match(drive, /saveCbsFirestoreRecord\('cbsOnHandCases', record\)/);
  assert.match(drive, /Object\.assign\(record, await saveCbsFirestoreRecord\('cbsCases', record\)\)[\s\S]*CBS case Sheet backup failed/);
  assert.match(drive, /Object\.assign\(saved, await saveCbsFirestoreRecord\('cbsWrongBaggageCases', saved\)\)[\s\S]*Wrong-baggage Sheet backup failed/);
  assert.match(drive, /const savedRows = await cbsFirestore\.upsertMany\('cbsMissingBagReports', newRows\);[\s\S]*CBS missing bag Sheet backup failed/);
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

test('CBS case refresh reads Firestore and does not restart the page sync', () => {
  assert.match(drive, /async function getCbsCases\(\) \{\s*const rows = \(await cbsFirestore\.list\('cbsCases'\)\) \|\| \[\]/);
  assert.doesNotMatch(drive, /async function getCbsCases\(\)[\s\S]*?getCbsSheetRows[\s\S]*?\n\}/);
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

test('On-hand excludes gate bags and Co-mail', () => {
  const description = 'Passenger bags entered as inbound and not-loaded outbound bags remain here until resolved. Gate bags and Co-mail are not included.';
  assert.equal((page.match(new RegExp(description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 2);
  assert.match(page, /<option>Gate bag<\/option>/);
  assert.match(page, /<option>Co-mail<\/option>/);
  assert.match(drive, /\.filter\(\(row\) => !isCbsOnHandExcludedBag\(row\)\)/);
  assert.match(drive, /if \(isCbsOnHandExcludedBag\(record\)\) return \{ created: false, excluded: true \};/);
  assert.match(drive, /new Set\(\['gate bag', 'co-mail'\]\)/);
  assert.match(drive, /\[record\.status, record\.bagType\][\s\S]*excludedTypes\.has/);
});

test('On-hand cases match the passenger case layout and support WorldTracer progress', () => {
  assert.match(page, /<th>WorldTracer File Number<\/th><th>Bag Tag<\/th><th>Direction<\/th>/);
  assert.match(page, /class="case-detail-layout"><div class="case-progress-column">\$\{unresolvedProgressHtml\(progressRow\)\}/);
  assert.match(page, /<option value="worldtracer">WorldTracer<\/option>/);
  assert.match(drive, /cbsFirestore\.list\('cbsOnHandCases'\)/);
  assert.match(page, /active\.rowNumber \|\| active\.firestoreId/);
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

test('CBS Email offers a bilingual address confirmation request', () => {
  assert.match(page, /value="address_confirm_request">Address Confirm Request Email/);
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
  assert.match(drive, /saveCbsFirestoreRecord\('cbsCases', next\)/);
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
  for (const action of ['sent_open_bag_authorization_to_pvg', 'contact_pax_pickup_bags', 'pickup_bags_future_available', 'baggage_transfer_status_eta', 'address_confirm_request', 'baggage_pickup_delivery_method_confirmation', 'require_open_bag_authorization_pvg']) {
    assert.equal((page.match(new RegExp(`value="${action}"`, 'g')) || []).length, 3, `${action} should appear in all three Email menus`);
  }
  assert.doesNotMatch(page, /\{ key:'open_bag_authorization_pvg'/);
  assert.doesNotMatch(server, /type === 'open_bag_authorization_pvg'/);
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
