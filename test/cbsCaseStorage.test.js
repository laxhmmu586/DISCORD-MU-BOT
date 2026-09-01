const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const drive = fs.readFileSync(path.join(__dirname, '..', 'googleDrive.js'), 'utf8');

test('CBS updates persist their note, timestamp, and WorldTracer file number', () => {
  assert.match(drive, /updateNote: incomingNote \|\| current\.updateNote \|\| ''/);
  assert.match(drive, /next\.worldTracerFileNumber = sanitizeSheetText/);
  assert.match(drive, /'WorldTracer File Number'/);
  assert.match(drive, /A\$\{current\.rowNumber\}:AM\$\{current\.rowNumber\}/);
  assert.match(drive, /cbsRecordMatchesId\(row, rowNumber\)/);
});

test('CBS reads required passenger details from their fixed sheet columns', () => {
  assert.match(drive, /row\.passengerName = values\[2\]/);
  assert.match(drive, /row\.ticketNumber = values\[5\]/);
  assert.match(drive, /row\.flightRoute = values\[7\]/);
  assert.match(drive, /row\.permanentAddress = values\[9\]/);
  assert.match(drive, /row\.baggageDetails = values\[13\]/);
  assert.match(drive, /row\.ahlBagDescription = row\.ahlBagDescription \|\| row\.baggageDetails/);
  assert.match(drive, /row\.worldTracerFileNumber = values\[33\]/);
  assert.match(drive, /row\.trackingNumber = values\[34\]/);
  assert.match(drive, /row\.shippingAddress = values\[35\]/);
  assert.match(drive, /row\.estimatedArrivalTime = values\[36\]/);
  assert.match(drive, /row\.bdo = values\[37\]/);
  assert.match(drive, /row\.language = values\[38\] \|\| row\.language \|\| ''/);
  assert.match(drive, /record\.language \|\| ''/);
});

test('Baggage transfer ETA email updates persist their ETA in column AK', () => {
  assert.match(drive, /'Estimated Arrival Time'/);
  assert.match(drive, /record\.estimatedArrivalTime \|\| ''/);
  assert.match(drive, /new Map\(update\.updateEvent\?\.fields \|\| \[\]\)\.get\('Estimated Arrival Time'\)/);
  assert.match(drive, /!A:AM/);
});

test('DPR WorldTracer updates close the case automatically', () => {
  assert.match(drive, /closesDprWorldTracer = update\.updateEvent\?\.key === 'worldtracer'/);
  assert.match(drive, /closesDprWorldTracer \? 'Closed - WorldTracer'/);
  assert.doesNotMatch(drive, /update\.updateEvent\?\.key === 'forward_mu'/);
});

test('requested bags updates store the requesting station in case history', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.match(server, /const fromStation = sanitizeCbsText\(update\.fromStation, 120\)\.toUpperCase\(\)/);
  assert.match(server, /REQUESTED BAGS \| From station: \$\{fromStation\}/);
  assert.match(server, /fields: \[\['From Station', fromStation\]\]/);
});

test('Rush updates no longer require or store an AKE number', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const rushBlock = server.match(/if \(type === 'rush'\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(rushBlock, /if \(!rushTagNumber \|\| !rushToWhere\) return null/);
  assert.doesNotMatch(rushBlock, /akeNumber|AKE Number|AKE:/);
});

test('lost updates persist the Delayed to Lost status transition', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.match(server, /status: 'Closed - Lost'/);
  assert.match(server, /fields: \[\['Status Change', 'DELAYED → LOST'\], \['Case Status', 'CLOSED'\]\]/);
});

test('shipping updates validate and store the selected delivery method', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  for (const method of ['ADC - All Day Courier', 'MBI DELIVERY AND STORAGE - STANDARD', 'BDO', 'FedEx Delivery', 'Pick Up at Airport', 'Passenger Pay for Shipping']) assert.match(server, new RegExp(method));
  assert.match(server, /fields: \[\['Shipping Method', shippingMethod\]/);
  assert.match(server, /SHIPPING \| Method: \$\{shippingMethod\}/);
  assert.match(server, /shippingMethod === 'FedEx Delivery' && !trackingNumber/);
  assert.match(server, /trackingNumber \? \[\['Tracking Number', trackingNumber\]\] : \[\]/);
  assert.match(drive, /next\.trackingNumber = sanitizeSheetText/);
  assert.match(drive, /next\.shippingAddress = sanitizeSheetText/);
  assert.match(drive, /next\.bdo = sanitizeSheetText/);
  assert.match(drive, /'BDO'/);
  assert.match(server, /needsBdo && !bdo/);
  assert.match(server, /\[\['BDO', bdo\]\]/);
  assert.match(server, /airportPickup \? 'Closed - Pick Up at Airport' : 'Closed - Shipping'/);
  assert.match(server, /status:'Shipping'/);
  assert.match(server, /followUpEvent: \{ key:'closed', title:'Case Closed'/);
});
