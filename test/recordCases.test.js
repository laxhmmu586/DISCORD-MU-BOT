const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const form = fs.readFileSync(path.join(root, 'public/public/irr-form.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'public/public/irr.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'public/public/index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const drive = fs.readFileSync(path.join(root, 'googleDrive.js'), 'utf8');

test('IRR form is bilingual, conditionally collects companions, and prevents duplicate submits', () => {
  assert.match(form, /Flight Irregularity Assistance/);
  assert.match(form, /航班异常特殊处理/);
  assert.match(form, /Boarding number \(BN\)/);
  assert.match(form, /本次旅途最终目的地/);
  assert.match(form, /name="travelParty" value="companions"/);
  assert.match(form, /companionInput\.required=show/);
  assert.match(form, /if\(submitting\)return/);
  assert.match(form, /Please wait\. Do not submit again\./);
});

test('IRR submissions resolve main and companion BNs from the current flight record', () => {
  assert.match(server, /app\.post\('\/irr-form-submissions'/);
  assert.match(server, /recordPassengerByBn\(bn\)/);
  assert.match(server, /Companion BN not found/);
  assert.match(server, /pnrRecord:passenger\.sourceText/);
});

test('IRR cases are archived in the requested Google Sheet and cached for live multi-user reads', () => {
  assert.match(drive, /1t0TS3__Im1tyLy7Hj7CGF8zet_-5TT1986QCodhvYbo/);
  assert.match(drive, /1472152106/);
  assert.match(drive, /recordCaseCache = \{ expiresAt:0/);
  assert.match(drive, /Date\.now\(\) \+ 5000/);
  assert.match(drive, /spreadsheets\.values\.append/);
  assert.match(admin, /setInterval\(load,5000\)/);
  assert.match(admin, /New ticket number/);
  assert.match(admin, /Update note \/ 留言/);
});

test('IRR dashboard uses MUIRR navigation and separates operational queues', () => {
  assert.match(admin, /class="brand" href="index\.html">MUIRR</);
  assert.match(admin, /data-view="Waiting"/);
  assert.match(admin, /data-view="In Progress"/);
  assert.match(admin, /data-view="Hotel"/);
  assert.match(admin, /data-view="Case Closed"/);
  assert.match(admin, /normalizedStatus/);
  assert.doesNotMatch(admin, /Passenger filed|Being handled|Accommodation/);
});

test('IRR is linked below Security Check instead of the primary navigation', () => {
  assert.match(home, /id="security-check-button"[^>]*>Security Check<\/button>\s*<button id="irr-button"[^>]*>IRR<\/button>/);
  assert.doesNotMatch(home, /id="record-nav-link"/);
  assert.doesNotMatch(home, /href="record\.html"/);
  assert.match(home, /location\.href='irr\.html'/);
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

test('IRR cases keep a progress timeline and persistent conversation history', () => {
  assert.match(admin, /Case Progress/);
  assert.match(admin, /Case Conversation/);
  assert.match(admin, /name="chatMessage"/);
  assert.match(admin, /PAGE_SIZE=8/);
  assert.match(drive, /'Case History'/);
  assert.match(drive, /type:'status'/);
  assert.match(drive, /type:'message'/);
  assert.match(drive, /V\$\{number\}/);
});

test('IRR form illustrates both sections of the China Eastern boarding pass', () => {
  assert.match(form, /CHINA EASTERN/);
  assert.match(form, /BOARDING PASS/);
  assert.match(form, /SERIAL NO\./);
  assert.match(form, /class="pass-stub"/);
});

test('IRR dashboard uses MUFC navigation and separates operational queues', () => {
  assert.match(admin, /class="brand" href="index\.html">MUFC</);
  assert.match(admin, /data-view="Waiting"/);
  assert.match(admin, /data-view="In Progress"/);
  assert.match(admin, /data-view="Hotel"/);
  assert.match(admin, /normalizedStatus/);
});

test('IRR is linked below Security Check instead of the primary navigation', () => {
  assert.match(home, /id="security-check-button"[^>]*>Security Check<\/button>\s*<button id="irr-button"[^>]*>IRR<\/button>/);
  assert.doesNotMatch(home, /id="record-nav-link"/);
  assert.doesNotMatch(home, /href="record\.html"/);
  assert.match(home, /location\.href='irr\.html'/);
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

test('IRR form illustrates both sections of the China Eastern boarding pass', () => {
  assert.match(form, /CHINA EASTERN/);
  assert.match(form, /BOARDING PASS/);
  assert.match(form, /SERIAL NO\./);
  assert.match(form, /class="pass-stub"/);
});
