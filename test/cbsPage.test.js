const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'cbs.html'), 'utf8');

test('CBS passenger information keeps all operationally required fields visible', () => {
  const requiredFields = page.match(/const requiredPassengerFields = \[([\s\S]*?)\n\s*\];/)?.[1] || '';
  for (const label of ['Passenger Name', 'Email', 'Phone', 'Ticket Number', 'Flight Route', 'Bag Tag', 'Permanent Address']) {
    assert.match(requiredFields, new RegExp(`label\\('${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(page, /requiredFieldGrid\(requiredPassengerFields\)/);
});

test('CBS passenger detail view can recover values from the original form snapshot', () => {
  assert.match(page, /JSON\.parse\(row\.originalFormData \|\| '\{\}'\)/);
});
