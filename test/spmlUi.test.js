const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../public/public/index.html'), 'utf8');

test('meal order card shows today and tomorrow without dashboard tiles', () => {
  assert.match(html, />Meal Order</);
  assert.match(html, /reservation-day today">TODAY/);
  assert.match(html, /reservation-day tomorrow">TOMORROW/);
  assert.match(html, />ORDERED SPML</);
  assert.match(html, /id="reservation-table-today"/);
  assert.match(html, /id="reservation-table-tomorrow"/);
  assert.doesNotMatch(html, /id="jcsy-detail-action"/);
  assert.doesNotMatch(html, /id="security-detail-action"/);
});

test('security check is available from the flight menu', () => {
  assert.match(html, /class="flight-menu"[\s\S]*id="security-check-button"[^>]*>Security Check</);
});

test('empty PD meal totals display a dash rather than None', () => {
  assert.match(html, /join\("\\n"\) \|\| "-"/);
  assert.doesNotMatch(html, /\|\| "None"/);
});

test('meal order reconciliation colors reservation totals and SPML mismatches', () => {
  assert.match(html, /orderedTotal > reservation[\s\S]*classList\.add\("is-over"\)/);
  assert.match(html, /orderedTotal < reservation[\s\S]*classList\.add\("is-under"\)/);
  assert.match(html, /!mealCountsMatch\(orderedMeals, pdMeals\)[\s\S]*classList\.add\("is-mismatch"\)/);
});
