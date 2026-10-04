const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', 'public/public/cbs.html'), 'utf8');

test('another passenger email renders both languages with the requested subject and signature', () => {
  const source = server.match(/function baggagePickedUpByAnotherPassengerEmail[\s\S]*?\n}/)[0];
  const context = { cbsEmailIsChinese: record => record.language === 'zh', cbsPlainTextEmailHtml: text => text };
  vm.createContext(context);
  vm.runInContext(source, context);
  const english = context.baggagePickedUpByAnotherPassengerEmail({ language: 'en' });
  assert.equal(english.subject, 'Update Regarding Your Baggage');
  assert.ok(english.text.includes('your baggage was mistakenly picked up by another passenger at the baggage claim area.'));
  assert.ok(english.text.includes('We have already contacted the passenger involved'));
  assert.ok(english.text.endsWith('Best regards,\nChina Eastern Airlines\nLos Angeles Station'));
  const chinese = context.baggagePickedUpByAnotherPassengerEmail({ language: 'zh' });
  assert.equal(chinese.subject, '关于您的行李情况更新');
  assert.ok(chinese.text.includes('您的行李在行李提取区域被另一位旅客误拿。'));
  assert.ok(chinese.text.endsWith('此致\n敬礼\n中国东方航空\n洛杉矶站'));
});

test('all three Email entry points offer and route the another passenger reason', () => {
  assert.equal((page.match(/value="baggage_picked_up_by_another_passenger"/g) || []).length, 3);
  assert.equal((page.match(/Reason: Baggage Picked Up by Another Passenger/g) || []).length, 3);
  assert.match(page, /\['baggage_open_by_customs', 'pickup_wrong_bags', 'baggage_picked_up_by_another_passenger'\]\.includes\(emailAction.value\)/);
  assert.match(server, /if \(emailAction === 'baggage_picked_up_by_another_passenger'\) \{[\s\S]*?baggagePickedUpByAnotherPassengerEmail\(record\)[\s\S]*?ccOperations:false/);
  assert.match(server, /emailAction === 'baggage_picked_up_by_another_passenger'\) message = baggagePickedUpByAnotherPassengerEmail\(emailRecord\)/);
  assert.match(server, /anotherPassengerEmail \? baggagePickedUpByAnotherPassengerEmail\(record\)/);
  assert.match(server, /\|\| anotherPassengerEmail \? record.email/);
});
