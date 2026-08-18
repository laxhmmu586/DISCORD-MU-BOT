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

test('CBS reads required passenger details from their fixed sheet columns', () => {
  assert.match(drive, /row\.passengerName = values\[2\]/);
  assert.match(drive, /row\.ticketNumber = values\[5\]/);
  assert.match(drive, /row\.flightRoute = values\[7\]/);
  assert.match(drive, /row\.permanentAddress = values\[9\]/);
});
