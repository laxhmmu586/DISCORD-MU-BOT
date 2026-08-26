const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const drive = fs.readFileSync(path.join(root, 'googleDrive.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'public', 'firebase.json'), 'utf8'));

test('backend has no Cloud Firestore adapter or calls', () => {
  assert.equal(fs.existsSync(path.join(root, 'cbsFirestore.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'reportFirestore.js')), false);
  assert.doesNotMatch(drive, /firestore/i);
  assert.doesNotMatch(server, /firestore/i);
  assert.equal(firebaseConfig.firestore, undefined);
});

test('Report Center persists and reads rows through Google Sheets', () => {
  assert.match(drive, /async function getStoredReportRows[\s\S]*getReportSheetRows/);
  assert.match(drive, /async function appendVipReportRows[\s\S]*appendVipReportRowsToSheet/);
  assert.match(drive, /async function appendPsmMsgReportRows[\s\S]*appendPsmMsgReportRowsToSheet/);
  assert.match(drive, /async function appendStoredReportRows[\s\S]*appendStoredReportRowsToSheet/);
  assert.match(drive, /async function syncSalesDetailsFromSourceSheet[\s\S]*sheets\.spreadsheets\.values\.append/);
});

test('Authorization Report remarks are stored in their Google Sheet row', () => {
  const page = fs.readFileSync(path.join(root, 'public', 'public', 'index.html'), 'utf8');
  assert.match(drive, /headers: \[[^\]]*'Detail', 'Key', 'Remark'\]/);
  assert.match(drive, /async function updatePsmMsgReportRemark[\s\S]*sheets\.spreadsheets\.values\.update/);
  assert.match(drive, /row\.key = String\(row\.key \|\| ''\)\.trim\(\) \|\| buildPsmMsgKey\(row\)/);
  assert.match(server, /app\.post\('\/psm-report\/remark'/);
  assert.doesNotMatch(server.match(/app\.post\('\/psm-report\/remark'[\s\S]*?\n}\);/)?.[0] || '', /cleanBodyText\(req\.body\?\.key/);
  assert.match(page, />Authorization Report<\/button>/);
  assert.match(page, /data-authorization-remark/);
  assert.match(page, /method: "POST"/);
});

test('Authorization Report displays PSM and MSG together, separately from involuntary upgrades', () => {
  const page = fs.readFileSync(path.join(root, 'public', 'public', 'index.html'), 'utf8');
  const table = page.match(/function authorizationReportTable\(rows\)[\s\S]*?\n      }/)?.[0] || '';
  assert.match(table, /renderGroup\("PSM \/ MSG", psmMsgRows\)/);
  assert.match(table, /renderGroup\("Involuntary Upgrade", involuntaryUpgrades\)/);
  assert.match(table, /\^INVOLUNTARY UPGRADE/);
});

test('Authorization Report downloads as a branded, paginated PDF with manager approval', () => {
  const page = fs.readFileSync(path.join(root, 'public', 'public', 'index.html'), 'utf8');
  assert.match(page, /id="report-pdf-download"[^>]*>Download Report<\/button>/);
  assert.match(page, /China Eastern Airlines LAX Authorization Report/);
  assert.match(page, /CHINA EASTERN AIRLINES/);
  assert.match(page, /STATION MANAGER APPROVAL/);
  assert.match(page, /Station Manager Signature/);
  assert.match(page, /PAGE \$\{index \+ 1\} OF \$\{pages\.length\}/);
  assert.match(page, /Helvetica-Bold/);
  assert.match(page, /type: "application\/pdf"/);
  assert.match(page, /activeReportMode !== "psm"/);
});

test('all CBS stores use Sheet rows as their identifiers', () => {
  for (const functionName of ['getCbsCases', 'getWrongBaggageSubmissions', 'getCbsUnresolvedBaggageCases', 'getCbsWorldTracerCases', 'getCbsMissingBagReports']) {
    const block = drive.match(new RegExp(`async function ${functionName}\\b[\\s\\S]*?\\n}`))?.[0] || '';
    assert.match(block, /Sheet|sheet|spreadsheets/, `${functionName} must read Google Sheets`);
  }
  assert.match(drive, /record\.rowNumber = Number\(appendedRow\)/);
  assert.match(drive, /saved\.rowNumber = Number\(appendedRow\)/);
});
