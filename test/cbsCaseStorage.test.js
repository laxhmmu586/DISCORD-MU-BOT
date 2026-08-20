const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const drive = fs.readFileSync(path.join(__dirname, '..', 'googleDrive.js'), 'utf8');

test('CBS updates persist their note, timestamp, and WorldTracer file number', () => {
  assert.match(drive, /updateNote: incomingNote \|\| current\.updateNote \|\| ''/);
  assert.match(drive, /next\.worldTracerFileNumber = sanitizeSheetText/);
  assert.match(drive, /'WorldTracer File Number'/);
  assert.match(drive, /A\$\{rowIndex \+ 1\}:AJ\$\{rowIndex \+ 1\}/);
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

test('shipping updates validate and store the selected delivery method', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  for (const method of ['ADC - All Day Courier', 'FedEx Delivery', 'Pick Up at Airport', 'Passenger Pay for Shipping']) assert.match(server, new RegExp(method));
  assert.match(server, /fields: \[\['Shipping Method', shippingMethod\]/);
  assert.match(server, /SHIPPING \| Method: \$\{shippingMethod\}/);
  assert.match(server, /shippingMethod === 'FedEx Delivery' && !trackingNumber/);
  assert.match(server, /trackingNumber \? \[\['Tracking Number', trackingNumber\]\] : \[\]/);
  assert.match(drive, /next\.trackingNumber = sanitizeSheetText/);
  assert.match(drive, /next\.shippingAddress = sanitizeSheetText/);
});
