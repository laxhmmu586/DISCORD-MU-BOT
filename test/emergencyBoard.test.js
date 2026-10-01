const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('emergency scanner and board use their isolated endpoints and multi-format reader', () => {
  const scan = read('public/public/scan2.html');
  const board = read('public/public/m-board2.html');
  assert.match(scan, /BrowserMultiFormatReader/);
  assert.match(scan, /BrowserPDF417Reader \|\| ZXingBrowser\.BrowserMultiFormatReader/);
  assert.match(scan, /\.camera-wrap \{[^}]*aspect-ratio:4\/3/);
  assert.match(scan, /video \{[^}]*position:absolute;[^}]*width:100%; height:100%;[^}]*object-fit:cover/);
  assert.match(scan, /focusTimer = setInterval\(applyCameraFocus, 2500\)/);
  assert.doesNotMatch(scan, /<p>Scan <strong>/);
  assert.match(scan, /function isEmergencyBarcode/);
  assert.match(scan, /if \(!isEmergencyBarcode\(text\)\) return/);
  assert.match(scan, /<h1>EMERGENCY BOARDING<\/h1>/);
  assert.match(scan, /href="m-board2\.html">Manual Board<\/a>/);
  assert.match(scan, /\/cbs-scan2/);
  assert.match(board, /<h2>NBRD<\/h2>/);
  assert.match(board, /<table><thead><tr><th>BN<\/th><\/tr><\/thead><tbody>\$\{rows\.map/);
  assert.doesNotMatch(board, /<td>\$\{escapeHtml\(row\.seat\)\}<\/td>/);
  assert.match(board, /\/cbs-scan2\/records/);
  assert.match(board, /records\/entered/);
});

test('Emergency Boarding replaces DUP NAME below IRR in the flight menu', () => {
  const home = read('public/public/index.html');
  assert.match(home, /id="irr-button"[^>]*>IRR<\/button>\s*<button id="emergency-board-button"[^>]*>Emergency Boarding<\/button>/);
  assert.doesNotMatch(home, /flight-menu"\)\?\.appendChild\(action\)/);
});

test('emergency backend targets the requested sheet tab and exposes matching routes', () => {
  const drive = read('googleDrive.js');
  const server = read('index.js');
  assert.match(drive, /EMERGENCY_BOARD_SHEET_GID = Number\(process\.env\.EMERGENCY_BOARD_SHEET_GID \|\| 1102230555\)/);
  assert.match(drive, /function scheduleCbsScanSheetsRequest\(fn, priority = 'normal'\)/);
  assert.match(drive, /return await scheduleCbsScanSheetsRequest\(fn, priority\)/);
  assert.match(drive, /const priorityOrder = \{ scan: 0, normal: 1, background: 2 \}/);
  assert.doesNotMatch(drive, /CBS_SCAN_SHEETS_MIN_INTERVAL_MS/);
  assert.match(drive, /emergencyBoardSheetTitlePending = cbsScanSheetsCall/);
  assert.match(server, /app\.post\('\/cbs-scan2'/);
  assert.match(server, /parseEmergencyBoardScan/);
  assert.match(server, /app\.get\('\/cbs-scan2\/records'/);
  assert.match(server, /app\.post\('\/cbs-scan2\/nbrd-bns'/);
  assert.match(server, /appendCbsScanNbrdBns\(entries, options\)/);
  assert.match(server, /appendEmergencyBoardNbrdBns\(entries, options\)/);
  assert.match(server, /deleteCkinNbrdFromBothSheets\(req\.body\?\.bn/);
  assert.match(drive, /async function deleteCkinNbrdFromBothSheets/);
  assert.match(drive, /regularIndex >= 0/);
  assert.match(drive, /emergencyIndex >= 0/);
});

test('regular and emergency scans both batch saves and show the same successful scan details', () => {
  const drive = read('googleDrive.js');
  for (const [page, enqueueName, flushName, processName, prepareName] of [
    ['scan.html', 'appendCbsScanRecord', 'flushCbsScanAppendBatch', 'processCbsScanAppendBatch', 'prepareCbsScanAppend'],
    ['scan2.html', 'appendEmergencyBoardRecord', 'flushEmergencyBoardAppendBatch', 'processEmergencyBoardAppendBatch', 'prepareEmergencyBoardAppend']
  ]) {
    const html = read(`public/public/${page}`);
    assert.match(drive, new RegExp(`async function ${enqueueName}\\(record = \\{\\}\\) \\{[\\s\\S]*?setTimeout\\(${flushName}, 300\\)`));
    const processor = drive.slice(drive.indexOf(`async function ${processName}(`)).split('\n}\n')[0];
    assert.match(processor, /forceRefresh: true, priority: 'scan'/);
    assert.match(processor, new RegExp(`${prepareName}\\(item\\.record, dataRows\\)`));
    assert.match(processor, /values\.batchUpdate/);
    assert.match(html, /<div><b>Flight<\/b>\$\{data\.flight/);
    assert.match(html, /<div><b>Seat<\/b>\$\{data\.seat/);
    assert.match(html, /<div><b>BN<\/b>\$\{data\.bn/);
    assert.match(html, /data\.isInfant \? '<div><b>Type<\/b>INFANT<\/div>'/);
  }
});
