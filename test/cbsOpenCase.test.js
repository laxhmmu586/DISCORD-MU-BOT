const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'cbs.html'), 'utf8');

test('Open Case owns both case lists without the removed aggregator', () => {
  assert.match(html, /id="open-cases-card"[\s\S]*id="cases-output"[\s\S]*id="unresolved-baggage-output"/);
  assert.doesNotMatch(html, /openCasesOutput|renderOpenCases/);
  assert.doesNotMatch(html, /id="passenger-cases-tab"|id="unresolved-baggage-tab"/);
  assert.match(html, /Promise\.allSettled\(\[loadCases\(\), loadUnresolvedBaggage\(\)\]\)/);
});

test('full passenger files include passenger, baggage, and AHL information', () => {
  for (const label of [
    'Passenger Name',
    'Email',
    'Mobile number - US',
    'Ticket Number',
    'Flights*',
    'Address',
    'Baggage information / AHL information',
    'AHL Bag Description',
    'AHL Bag Brand Tag',
    'AHL Bag Type',
    'AHL Features',
    'AHL Other Features',
    'AHL Contents'
  ]) assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
