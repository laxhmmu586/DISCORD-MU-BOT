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
  assert.doesNotMatch(form, /本次旅途最终目的地|Final destination|name="finalDestination"/);
  assert.match(form, /name="travelParty" value="companions"/);
  assert.match(form, /companionInput\.required=show/);
  assert.match(form, /if\(submitting\)return/);
  assert.match(form, /Please wait\. Do not submit again\./);
});

test('IRR submissions resolve main and companion BNs from the current flight record', () => {
  assert.match(server, /app\.post\('\/irr-form-submissions'/);
  assert.match(server, /recordPassengerByBn\(bn\)/);
  assert.match(server, /Companion BN not found/);
  assert.match(server, /status:'Waiting'/);
  assert.match(server, /intention, finalDestination:'', pnrRecord:passenger\.sourceText/);
  assert.doesNotMatch(server.match(/app\.post\('\/irr-form-submissions'[\s\S]*?app\.get\('\/irr-cases'/)?.[0] || '', /req\.body\?\.finalDestination/);
});

test('IRR cases are archived in the requested Google Sheet and cached for live multi-user reads', () => {
  assert.match(drive, /1t0TS3__Im1tyLy7Hj7CGF8zet_-5TT1986QCodhvYbo/);
  assert.match(drive, /1472152106/);
  assert.match(drive, /recordCaseCache = \{ expiresAt:0/);
  assert.match(drive, /Date\.now\(\) \+ 5000/);
  assert.match(drive, /spreadsheets\.values\.append/);
  assert.match(server, /app\.get\('\/irr-cases\/stream'/);
  assert.match(server, /Content-Type', 'text\/event-stream'/);
  assert.match(server, /broadcastIrrCaseUpdate\(record\)/);
  assert.match(server, /setInterval\(pollIrrCaseStreams, 5000\)/);
  assert.match(admin, /new EventSource\(`\$\{apiBase\}\/irr-cases\/stream`\)/);
  assert.match(admin, /stream\.addEventListener\('case-update'/);
  assert.match(admin, />Connecting…<\/span>/);
  assert.match(admin, /expectedUpdatedAt/);
  assert.match(admin, /New ticket number/);
  assert.match(admin, /New Ticket Number/);
  assert.match(admin, /Comment \/ 留言/);
});

test('IRR tracks the passenger confirmation, handling, document delivery, and closure workflow', () => {
  assert.doesNotMatch(admin, /data-view="Print Queue"/);
  assert.match(admin, /Confirm with Passenger/);
  assert.match(admin, /Passenger selected \*/);
  assert.match(admin, /option value="rebooking">Rebooking/);
  assert.match(admin, /option value="refund">Refund/);
  assert.match(admin, /Provide New Itinerary \/ New Ticket Number/);
  assert.match(admin, /Hotel Confirmation Provided/);
  assert.doesNotMatch(admin, /Refund Completed & Close/);
  assert.match(admin, /Provide refund information/);
  assert.match(admin, /workflow-step \${step\.done\?'done':step\.key===current\?'current':''}/);
  assert.match(admin, /Case Workflow/);
  assert.doesNotMatch(admin, /Confirm the passenger, complete the applicable/);
  assert.doesNotMatch(admin, /Handle rebooking or refund request/);
  assert.match(admin, /if\(flow\.requestType==='rebooking'\)steps\.push/);
  assert.match(admin, /if\(flow\.requestType==='refund'\)steps\.push/);
  assert.match(admin, /if\(flow\.hotelRequested\|\|flow\.hotelProvided\)\{steps\.push/);
  assert.match(admin, /label:'Request hotel'/);
  assert.match(admin, /Select rebooking or refund/);
  assert.match(drive, /'Case Workflow'/);
  assert.match(drive, /passengerConfirmed/);
  assert.match(drive, /itineraryDelivered/);
  assert.match(drive, /hotelConfirmationDelivered/);
  assert.match(drive, /Provide the new itinerary before closing the case/);
  assert.match(drive, /Provide refund information before closing the case/);
  assert.match(drive, /Provide the hotel confirmation before closing the case/);
  assert.doesNotMatch(drive, /refundComplete/);
  assert.match(drive, /original ticketing channel/);
  assert.match(drive, /!W\$\{number\}/);
});

test('agents can manually correct mismatched PNR and TKT records', () => {
  assert.match(admin, /Manually Update PNR Record/);
  assert.match(admin, /Manually Update TKT Record/);
  assert.match(admin, /name="pnrRecord"/);
  assert.match(admin, /name="manualTicketNumber"/);
  assert.match(drive, /manualPnr:'PNR record manually corrected'/);
  assert.match(drive, /manualTkt:'TKT record manually corrected'/);
  assert.match(drive, /!L\$\{number\}/);
  assert.match(drive, /!X\$\{number\}/);
  assert.match(admin, /body\.tktRecord=body\.manualTicketNumber/);
  assert.match(admin, /row\.tktRecord/);
});

test('case rows show the new ticket number between passenger and status', () => {
  const passenger = admin.indexOf('<span class="label">Passenger</span>');
  const ticket = admin.indexOf('<span class="label">New Ticket Number</span>');
  const status = admin.indexOf('<span class="label">Status</span>');
  assert.ok(passenger < ticket && ticket < status);
});

test('IRR removes destination and groups Waiting cases by membership', () => {
  assert.doesNotMatch(admin, /<span class="label">(?:Submitted|Destination)<\/span>/);
  assert.doesNotMatch(admin, /Search BN, name, destination/);
  assert.match(admin, /if\(currentView==='Waiting'\)all=\[\.\.\.all\.filter\(membershipType\),\.\.\.all\.filter\(row=>!membershipType\(row\)\)\]/);
  assert.doesNotMatch(admin, /case-group-title|Members \(\$\{|Regular \(\$\{/);
  assert.match(admin, /member=membershipType\(row\)/);
  assert.match(admin, /\$\{member\?`<div class="member-cell"[\s\S]*:''\}/);
  assert.match(admin, /function membershipHtml\(row\)/);
  for (const tier of ['Platinum', 'Gold', 'Silver', 'Elite Plus', 'Elite']) assert.match(admin, new RegExp(`return '${tier}'`));
  assert.match(admin, /class="member-cell"><span class="label">Member<\/span>\$\{membershipHtml\(row\)\}/);
  assert.match(admin, /member-badge[\s\S]*<svg viewBox=/);
  assert.doesNotMatch(admin, /short='(?:P|G|S|E)'/);
  assert.match(admin, /<div class="side-bottom"><span class="live-status reconnecting" id="live-status"/);
});

test('IRR dashboard uses MUIRR navigation and separates operational queues', () => {
  assert.match(admin, /class="brand" href="index\.html">MUIRR</);
  assert.match(admin, /data-view="Waiting"/);
  assert.match(admin, /data-view="In Progress"/);
  assert.match(admin, /data-view="Hotel"/);
  assert.match(admin, /const hasHotel=row=>Boolean\(row\.hotelReservationNumber\|\|row\.caseWorkflow\?\.hotelRequested\|\|row\.caseWorkflow\?\.hotelProvided\)/);
  assert.match(admin, /rows\.filter\(hasHotel\)\.length/);
  assert.match(admin, /data-view="Case Closed"/);
  assert.match(admin, /normalizedStatus/);
  assert.doesNotMatch(admin, /Passenger filed|Being handled|Accommodation/);
});

test('IRR sidebar can collapse and remembers the selected width', () => {
  assert.match(admin, /id="sidebar-toggle"/);
  assert.match(admin, /body\.sidebar-collapsed\{padding-left:76px\}/);
  assert.match(admin, /localStorage\.setItem\('muirr-sidebar-collapsed'/);
  assert.match(admin, /aria-label',collapsed\?'Expand sidebar':'Collapse sidebar'/);
});

test('IRR is linked below Security Check instead of the primary navigation', () => {
  assert.match(home, /id="security-check-button"[^>]*>Security Check<\/button>\s*<button id="irr-button"[^>]*>IRR<\/button>/);
  assert.doesNotMatch(home, /id="record-nav-link"/);
  assert.doesNotMatch(home, /href="record\.html"/);
  assert.match(home, /location\.href='irr\.html'/);
});

test('hotel requests move to the Hotel queue before a hotel agent adds the reservation', () => {
  assert.match(admin, /value="requestHotel">Request Hotel/);
  assert.match(admin, /currentView==='Hotel'\?'<option value="hotel">Provide Hotel/);
  assert.match(admin, /body\.action==='requestHotel'\?'Hotel'/);
  assert.match(drive, /if \(action === 'requestHotel'\) completeStep\('hotelRequested'\)/);
  assert.match(drive, /requestHotel:'Hotel requested'/);
  assert.match(drive, /caseWorkflow\.hotelRequested && !caseWorkflow\.hotelProvided/);
  assert.match(admin, /Reservation Number \(optional\)/);
  assert.doesNotMatch(admin, /body\.action==='hotel'&&!body\.hotelReservationNumber\.trim/);
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
