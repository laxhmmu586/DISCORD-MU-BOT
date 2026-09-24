const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const form = fs.readFileSync(path.join(root, 'public/public/record-form.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'public/public/record.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const drive = fs.readFileSync(path.join(root, 'googleDrive.js'), 'utf8');

test('record form is bilingual, conditionally collects companions, and prevents duplicate submits', () => {
  assert.match(form, /Flight Irregularity Assistance/);
  assert.match(form, /航班异常特殊处理/);
  assert.match(form, /Boarding number \(BN\)/);
  assert.match(form, /本次旅途最终目的地/);
  assert.match(form, /name="travelParty" value="companions"/);
  assert.match(form, /companionInput\.required=show/);
  assert.match(form, /if\(submitting\)return/);
  assert.match(form, /Please wait\. Do not submit again\./);
});

test('record submissions resolve main and companion BNs from the current flight record', () => {
  assert.match(server, /app\.post\('\/record-form-submissions'/);
  assert.match(server, /recordPassengerByBn\(bn\)/);
  assert.match(server, /Companion BN not found/);
  assert.match(server, /pnrRecord:passenger\.sourceText/);
});

test('record cases are archived in the requested Google Sheet and cached for live multi-user reads', () => {
  assert.match(drive, /1t0TS3__Im1tyLy7Hj7CGF8zet_-5TT1986QCodhvYbo/);
  assert.match(drive, /1472152106/);
  assert.match(drive, /recordCaseCache = \{ expiresAt:0/);
  assert.match(drive, /Date\.now\(\) \+ 5000/);
  assert.match(drive, /spreadsheets\.values\.append/);
  assert.match(admin, /setInterval\(load,5000\)/);
  assert.match(admin, /New ticket number/);
  assert.match(admin, /Comment \/ 留言/);
});

test('record dashboard uses MUFC navigation and separates operational queues', () => {
  assert.match(admin, /class="brand" href="index\.html">MUFC</);
  assert.match(admin, /data-view="Waiting"/);
  assert.match(admin, /data-view="In Progress"/);
  assert.match(admin, /data-view="Hotel"/);
  assert.match(admin, /normalizedStatus/);
});

test('hotel assignments collect and persist the required accommodation details', () => {
  assert.match(admin, /name="hotelName"/);
  assert.match(admin, /name="hotelAddress"/);
  assert.match(admin, /name="hotelConfirmation"/);
  assert.match(admin, /name="hotelCheckIn"/);
  assert.match(admin, /name="hotelCheckOut"/);
  assert.match(drive, /'Hotel Name'.*'Hotel Address'.*'Hotel Confirmation'.*'Hotel Check-in'.*'Hotel Check-out'/);
  assert.match(drive, /Q\$\{number\}:U\$\{number\}/);
});

test('record form illustrates both sections of the China Eastern boarding pass', () => {
  assert.match(form, /CHINA EASTERN/);
  assert.match(form, /BOARDING PASS/);
  assert.match(form, /SERIAL NO\./);
  assert.match(form, /class="pass-stub"/);
});
