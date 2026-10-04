const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const form = fs.readFileSync(path.join(__dirname, '../public/public/pir-form.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

test('PIR has one bag list and removes the redundant AHL section and mandatory description', () => {
  assert.equal((form.match(/id="bag-selector-grid"/g) || []).length, 1);
  assert.equal((form.match(/id="add-another-bag"/g) || []).length, 1);
  assert.doesNotMatch(form, /ahl-fields|ahlDescriptionInput|延误或丢失行李信息/);
  assert.doesNotMatch(server, /AHL baggage description is required/);
  const card = form.slice(form.indexOf('card.innerHTML ='), form.indexOf('bagSelectorGrid.appendChild(card)'));
  assert.ok(card.indexOf("picker('descriptor'") < card.indexOf('data-bag-description'));
  assert.ok(card.indexOf('data-bag-description') < card.indexOf('data-bag-other-features'));
  for (const attr of ['data-bag-description', 'data-bag-other-features']) {
    assert.doesNotMatch(card.match(new RegExp(`<textarea ${attr}[^>]*>`))[0], /required/);
  }
});

function payloadFor(bags) {
  const selectors = { 'data-bag-tag': 'tag', 'data-bag-color': 'color', 'data-bag-type': 'type', 'data-bag-descriptors': 'descriptors', 'data-bag-description': 'description', 'data-bag-other-features': 'otherFeatures' };
  const context = {
    payload: {}, typeSelect: { value: 'AHL' },
    bagSelectorGrid: { querySelectorAll: () => bags.map(bag => ({ querySelector: selector => ({ value: bag[selectors[selector.slice(1, -1)]] || '' }) })) }
  };
  vm.createContext(context);
  vm.runInContext(form.slice(form.indexOf('      const bagIdentifications ='), form.indexOf('      payload.contentsRows =')), context);
  return context.payload;
}

test('optional descriptions can be blank while IATA identification remains in the report', () => {
  const result = payloadFor([{tag:'MU123456', color:'BK', type:'02', descriptors:'L'}]);
  assert.equal(result.ahlBagDescription, 'IATA identification: Bag 1 Tag MU123456, BK-02, elements L');
  assert.equal(result.ahlOtherFeatures, '');
});

test('multiple bags retain their descriptions and other visible features in saved report fields', () => {
  const result = payloadFor([
    {tag:'MU123456',color:'BK',type:'02',description:'黑色硬壳箱',otherFeatures:'红丝带'},
    {tag:'MU654321',color:'BU',type:'22',description:'Blue suitcase',otherFeatures:'White sticker'}
  ]);
  assert.match(result.ahlBagDescription, /Bag 1: 黑色硬壳箱 \| Bag 2: Blue suitcase$/);
  assert.equal(result.ahlOtherFeatures, 'Bag 1: 红丝带 / Bag 2: White sticker');
});
