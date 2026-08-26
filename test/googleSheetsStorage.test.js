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
  assert.match(server, /app\.patch\('\/psm-report\/remark'/);
  assert.match(page, />Authorization Report<\/button>/);
  assert.match(page, /data-authorization-remark/);
  assert.match(page, /method: "PATCH"/);
});

test('all CBS stores use Sheet rows as their identifiers', () => {
  for (const functionName of ['getCbsCases', 'getWrongBaggageSubmissions', 'getCbsUnresolvedBaggageCases', 'getCbsWorldTracerCases', 'getCbsMissingBagReports']) {
    const block = drive.match(new RegExp(`async function ${functionName}\\b[\\s\\S]*?\\n}`))?.[0] || '';
    assert.match(block, /Sheet|sheet|spreadsheets/, `${functionName} must read Google Sheets`);
  }
  assert.match(drive, /record\.rowNumber = Number\(appendedRow\)/);
  assert.match(drive, /saved\.rowNumber = Number\(appendedRow\)/);
});
