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
  assert.match(admin, /setInterval\(\(\)=>load\(\),60000\)/);
  assert.match(admin, /expectedUpdatedAt/);
  assert.match(admin, /New ticket number/);
  assert.match(admin, /New Ticket Number/);
  assert.match(admin, /Comment \/ 留言/);
});

test('IRR tracks the passenger confirmation, handling, document delivery, and closure workflow', () => {
  assert.doesNotMatch(admin, /data-view="Print Queue"/);
  assert.match(admin, /Confirm with Passenger/);
  assert.match(admin, /Change Ticket \/ New Ticket Number/);
  assert.match(admin, /New Itinerary Provided/);
  assert.match(admin, /Hotel Confirmation Provided/);
  assert.doesNotMatch(admin, /Refund Completed & Close/);
  assert.match(admin, /original-channel guidance/);
  assert.match(admin, /workflow-step \${step\.done\?'done':step\.key===current\?'current':''}/);
  assert.match(admin, /Case Workflow/);
  assert.match(drive, /'Case Workflow'/);
  assert.match(drive, /passengerConfirmed/);
  assert.match(drive, /itineraryDelivered/);
  assert.match(drive, /hotelConfirmationDelivered/);
  assert.doesNotMatch(drive, /refundComplete/);
  assert.match(drive, /original ticketing channel/);
  assert.match(drive, /!W\$\{number\}/);
});

test('IRR dashboard uses MUIRR navigation and separates operational queues', () => {
  assert.match(admin, /class="brand" href="index\.html">MUIRR</);
  assert.match(admin, /data-view="Waiting"/);
  assert.match(admin, /data-view="In Progress"/);
  assert.doesNotMatch(admin, /data-view="Hotel"/);
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

test('hotel assignments store only reservation number and optional price', () => {
  assert.match(admin, /name="hotelReservationNumber"/);
  assert.match(admin, /name="hotelPrice"/);
  assert.doesNotMatch(admin, /name="hotelAddress"|name="hotelCheckIn"/);
  assert.match(drive, /'Hotel Reservation Number'.*'Hotel Price'.*'Passenger Wants Refund'/);
  assert.match(drive, /!Q\$\{number\}/);
  assert.match(drive, /!R\$\{number\}/);
});

test('IRR cases show workflow progress and persistent conversation history', () => {
  assert.match(admin, /Case Workflow/);
  assert.match(admin, /workflow-step\.current/);
  assert.match(admin, /Case Conversation/);
  assert.match(admin, /name="chatMessage"/);
  assert.match(admin, /Record - PNR/);
  assert.match(admin, /Record - TKT/);
  assert.match(admin, /Companion \$\{index\+1\}/);
  assert.match(admin, /PAGE_SIZE=8/);
  assert.match(drive, /'Case History'/);
  assert.match(drive, /type:'status'/);
  assert.match(drive, /type:'message'/);
  assert.match(drive, /V\$\{number\}/);
  assert.match(admin, /data-delete-message/);
  assert.match(admin, /deleteMessageIndex/);
  assert.match(drive, /deleteMessageIndex/);
  assert.match(drive, /operationalActions\.has\(action\).*'In Progress'/);
  assert.ok(admin.indexOf('Case Conversation') < admin.indexOf('${recordsHtml(row)}'), 'Records should render after the conversation');
});

test('IRR form displays the supplied China Eastern boarding pass image', () => {
  assert.match(form, /src="assets\/china-eastern-boarding-pass-example\.png\.png"/);
  assert.doesNotMatch(form, /class="pass-stub"/);
});
