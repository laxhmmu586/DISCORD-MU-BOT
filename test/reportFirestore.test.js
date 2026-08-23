const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.CBS_FIRESTORE_ENABLED = 'false';
const reportFirestore = require('../reportFirestore');
const drive = fs.readFileSync(path.join(__dirname, '..', 'googleDrive.js'), 'utf8');

test('Report Center uses a separate Firestore collection for every report type', () => {
  assert.equal(reportFirestore.collectionName('VIP'), 'reportCenter_vip');
  assert.equal(reportFirestore.collectionName('psm-msg'), 'reportCenter_psmMsg');
  assert.equal(reportFirestore.collectionName('sales details'), 'reportCenter_salesDetails');
});

test('Report Center document IDs are stable for the same logical row', () => {
  const first = { key:'VIP|2026-08-23|MU586|DOE/JANE', recordedAt:'2026-08-23T01:00:00Z' };
  const updated = { ...first, recordedAt:'2026-08-23T02:00:00Z' };
  assert.equal(reportFirestore.rowId('vip', first), reportFirestore.rowId('vip', updated));
  assert.notEqual(reportFirestore.rowId('vip', first), reportFirestore.rowId('vip', { key:'VIP|2026-08-23|MU586|DOE/JOHN' }));
});

test('Report Center normalizes endpoint aliases to their stored report types', () => {
  assert.equal(reportFirestore.normalizeType('WCH'), 'wheelchair');
  assert.equal(reportFirestore.normalizeType('psm_msg'), 'psmMsg');
  assert.equal(reportFirestore.normalizeType('sales-detail'), 'salesDetails');
});

test('every Report Center writer stores in Firestore before the Sheet backup', () => {
  for (const [functionName, firestoreCall, sheetCall] of [
    ['appendVipReportRows', "reportFirestore.upsertMany('vip'", 'appendVipReportRowsToSheet'],
    ['appendPsmMsgReportRows', "reportFirestore.upsertMany('psmMsg'", 'appendPsmMsgReportRowsToSheet'],
    ['appendStoredReportRows', 'reportFirestore.upsertMany(type', 'appendStoredReportRowsToSheet'],
    ['syncSalesDetailsFromSourceSheet', "reportFirestore.upsertMany('salesDetails'", "getReportSheetRows('salesDetails'"]
  ]) {
    const start = drive.indexOf(`async function ${functionName}(`);
    const end = drive.indexOf('\nasync function ', start + 1);
    const block = drive.slice(start, end < 0 ? undefined : end);
    assert.ok(block.indexOf(firestoreCall) >= 0, `${functionName} must write Firestore`);
    assert.ok(block.indexOf(sheetCall) > block.indexOf(firestoreCall), `${functionName} must back up to Sheet after Firestore`);
  }
});
