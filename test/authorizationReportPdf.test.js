const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'public/public/index.html'), 'utf8');
const logo = fs.readFileSync(path.join(root, 'assets/china-eastern-logo.svg'), 'utf8');

test('Authorization Report offers a PDF download beside CSV', () => {
  assert.match(page, /id="report-download"[^>]*>Download CSV<\/button><button[^>]*id="report-pdf-download"[^>]*aria-label="Download authorization report as PDF"[^>]*>Download Report<\/button>/);
  assert.match(page, /reportPdfDownloadButton\.hidden = activeReportMode !== "psm"/);
  assert.match(page, /\/psm-report\/pdf\?from=/);
  assert.match(page, /link\.download = `authorization-report-\$\{from\}.*\.pdf`/);
});

test('Authorization Report PDF has branded title, table, and signature line', () => {
  assert.match(server, /app\.get\('\/psm-report\/pdf'/);
  assert.match(server, /China Eastern Airlines LAX authorization report/);
  assert.match(server, /Station Manager Signature:/);
  assert.match(server, /Content-Type', 'application\/pdf'/);
  assert.match(logo, /CHINA EASTERN/);
  assert.match(logo, /SKYTEAM/);
});

test('Authorization Report displays PSM and MSG together, separately from involuntary upgrades', () => {
  assert.match(page, /renderGroup\("PSM \/ MSG", psmMsgRows\)/);
  assert.match(page, /renderGroup\("Involuntary Upgrade", involuntaryUpgradeRows\)/);
  assert.match(page, /String\(row\.type \|\| ""\).*=== "INVOLUNTARY UPGRADE"/);
});

test('initial SY refresh always dismisses the THINKING overlay', () => {
  assert.match(page, /if \(showLoading\) setLoadingState\(false\)/);
  assert.doesNotMatch(page, /if \(showLoading && currentSy\) setLoadingState\(false\)/);
});
