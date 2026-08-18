const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('WorldTracer update email does not regenerate or attach a PDF report', () => {
  const updateEmailBlock = server.match(/if \(updateFields\.updateEvent\?\.key === 'worldtracer'\) \{([\s\S]*?)\n\s*\}\n\s*return res\.json/)?.[1] || '';
  assert.match(updateEmailBlock, /sendCbsCaseEmail/);
  assert.match(updateEmailBlock, /ccOperations: false/);
  assert.doesNotMatch(updateEmailBlock, /createPirPdf|pdfBuffer|filename/);
});
