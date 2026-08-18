const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const drive = fs.readFileSync(path.join(__dirname, '..', 'googleDrive.js'), 'utf8');

test('CBS updates persist their note, timestamp, and WorldTracer file number', () => {
  assert.match(drive, /updateNote: incomingNote \|\| current\.updateNote \|\| ''/);
  assert.match(drive, /next\.worldTracerFileNumber = sanitizeSheetText/);
  assert.match(drive, /'WorldTracer File Number'/);
  assert.match(drive, /A\$\{rowIndex \+ 1\}:AH\$\{rowIndex \+ 1\}/);
});
