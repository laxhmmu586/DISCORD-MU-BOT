const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'public/public/index.html'), 'utf8');
const logo = fs.readFileSync(path.join(root, 'assets/china-eastern-logo.svg'), 'utf8');

test('Authorization Report offers a PDF download beside CSV', () => {
  assert.match(page, /id="report-download"[^>]*>Download CSV<\/button><button[^>]*id="report-pdf-download"[^>]*>Download Report<\/button>/);
  assert.match(page, /reportPdfDownloadButton\.hidden = activeReportMode !== "psm"/);
  assert.match(page, /\/psm-report\/pdf\?from=/);
});

test('Authorization Report PDF has branded title, table, and signature line', () => {
  assert.match(server, /app\.get\('\/psm-report\/pdf'/);
  assert.match(server, /China Eastern Airlines LAX authorization report/);
  assert.match(server, /Station Manager Signature:/);
  assert.match(server, /Content-Type', 'application\/pdf'/);
  assert.match(logo, /CHINA EASTERN/);
  assert.match(logo, /SKYTEAM/);
});
