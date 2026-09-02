const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../public/public/index.html'), 'utf8');

test('meal order card has date tabs without dashboard tiles', () => {
  assert.match(html, />Meal Order</);
  assert.match(html, /data-meal-day="today">---/);
  assert.match(html, /data-meal-day="tomorrow">---/);
  assert.equal((html.match(/class="reservation-head">SPML</g) || []).length, 2);
  assert.doesNotMatch(html, />ORDERED SPML</);
  assert.match(html, /id="reservation-table-today"/);
  assert.match(html, /id="reservation-table-tomorrow"/);
  assert.doesNotMatch(html, /id="jcsy-detail-action"/);
  assert.doesNotMatch(html, /id="security-detail-action"/);
});

test('mobile meal table fits the viewport without a forced wide canvas', () => {
  assert.match(html, /\.details-panel \{ width:calc\(100% - 24px\); \}/);
  assert.match(html, /\.reservation-table \{ width:auto; min-width:0; grid-template-columns:22px 38px 58px minmax\(76px,1fr\) minmax\(62px,1fr\)/);
  assert.doesNotMatch(html, /\.reservation-table \{ min-width:500px; \}/);
});

test('security check is available from the flight menu', () => {
  assert.match(html, /class="flight-menu"[\s\S]*id="security-check-button"[^>]*>Security Check</);
});

test('empty PD meal totals display a dash rather than None', () => {
  assert.match(html, /join\("\\n"\) \|\| "-"/);
  assert.doesNotMatch(html, /\|\| "None"/);
});

test('meal order reconciliation colors reservation totals and SPML mismatches', () => {
  assert.match(html, /orderedTotal >= reservation[\s\S]*classList\.add\("is-over"\)/);
  assert.match(html, /orderedTotal < reservation[\s\S]*classList\.add\("is-under"\)/);
  assert.match(html, /!mealCountsMatch\(orderedMeals, pdMeals\)[\s\S]*classList\.add\("is-mismatch"\)/);
  assert.match(html, /classList\.toggle\("has-shortage", hasShortage\)/);
  assert.match(html, /meal-order-tab-\$\{day\}`\)\?\.classList\.toggle\("has-shortage", hasShortage\)/);
});

test('today and tomorrow use a tab switcher with one visible panel', () => {
  assert.match(html, /role="tablist"/);
  assert.match(html, /id="meal-order-tab-today"[^>]*aria-selected="true"/);
  assert.match(html, /id="reservation-table-tomorrow"[^>]*hidden/);
  assert.match(html, /function selectMealOrderDay\(day\)/);
  assert.match(html, /function formatMealFlightDate\(value\)/);
  assert.match(html, /nextMealFlightDate\(sy\.flightDate\)/);
});

test('meal title is inside the shell and aligned to its top left', () => {
  assert.match(html, /id="meal-order-shell">\s*<strong class="meal-order-title">Meal Order/);
  assert.match(html, /\.meal-order-title \{[^}]*text-align:left/);
});

test('warning is the first operational action before CHD', () => {
  assert.match(html, /class="detail-actions" aria-label="Flight detail actions">\s*<button[^>]*id="warning-action"[\s\S]*id="chd-action"/);
});

test('meal table uses two styled vertical column dividers and compact columns', () => {
  assert.match(html, /\.column-divider[^}]*border-left:1px solid rgba\(71,183,236,.42\)/);
  assert.match(html, /grid-template-columns:34px 64px 76px minmax\(104px,1fr\) minmax\(104px,1fr\)/);
});
