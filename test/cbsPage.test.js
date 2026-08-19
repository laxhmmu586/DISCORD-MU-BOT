const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'cbs.html'), 'utf8');
const pirForm = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'pir-form.html'), 'utf8');

test('CBS passenger information keeps all operationally required fields visible', () => {
  const requiredFields = page.match(/const requiredPassengerFields = \[([\s\S]*?)\n\s*\];/)?.[1] || '';
  for (const label of ['Passenger Name', 'Email', 'Phone', 'Ticket Number', 'Flight Route', 'Permanent Address']) {
    assert.match(requiredFields, new RegExp(`label\\('${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.doesNotMatch(requiredFields, /label\('Bag Tag'/);
  assert.match(page, /requiredFieldGrid\(requiredPassengerFields\)/);
});

test('CBS tracking offers the requested bags stage', () => {
  assert.match(page, /key:'requested_bags', text:'Requested Bags'/);
  assert.match(page, /if \(key === 'requested_bags'\) return input\('From which station\?', 'fromStation'\)/);
  assert.match(page, /requested\[\\s_-\]\*bags\?/);
  assert.match(page, /event\.key === 'requested_bags' \? 'Update'/);
});

test('CBS tracking no longer offers Forward to MU', () => {
  assert.doesNotMatch(page, /forward_mu|Forward to MU/);
});

test('CBS passenger detail view can recover values from the original form snapshot', () => {
  assert.match(page, /JSON\.parse\(row\.originalFormData \|\| '\{\}'\)/);
});

test('CBS baggage information displays baggage details from sheet column N', () => {
  assert.match(page, /label\('Baggage Details', '行李详情'\), row\.baggageDetails \|\| row\.ahlBagDescription/);
});

test('CBS detail view omits the redundant journey and address section', () => {
  assert.doesNotMatch(page, /<h3>\$\{label\('Journey and address'/);
});

test('PIR form labels the optional attachment category as Others', () => {
  assert.match(pirForm, /<span class="en">Others<\/span><span class="zh">其他附件<\/span>/);
  assert.doesNotMatch(pirForm, />Other document<\/span>/);
});

test('expanded CBS cases show passenger email notification status', () => {
  assert.match(page, /function passengerNotificationHtml\(row\)/);
  assert.match(page, /Create report email/);
  assert.match(page, /WorldTracer update email/);
  assert.match(page, /Baggage request from other station email/);
  assert.match(page, /\.filter\(\(\[key\]\) => sentKeys\.has\(key\)\)/);
  assert.match(page, /passenger-notify-item is-sent/);
  assert.doesNotMatch(page, /sent \? ' is-sent'/);
  assert.doesNotMatch(page, /label\('Sent', '已发送'\)/);
  assert.match(page, /passengerNotificationHtml\(row\)/);
});
