const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('WorldTracer update email does not regenerate or attach a PDF report', () => {
  const updateEmailBlock = server.match(/if \(updateFields\.updateEvent\?\.key === 'worldtracer'\) \{([\s\S]*?)\n\s*if \(updateFields\.updateEvent\?\.key === 'requested_bags'\)/)?.[1] || '';
  assert.match(updateEmailBlock, /sendCbsCaseEmail/);
  assert.match(updateEmailBlock, /ccOperations: false/);
  assert.doesNotMatch(updateEmailBlock, /createPirPdf|pdfBuffer|filename/);
});

test('DPR WorldTracer update email confirms case creation and warns passengers not to reply', () => {
  assert.match(server, /subject: `【请勿回复】行李案件建案确认通知 – WorldTracer 案件编号：\$\{fileNumber\}`/);
  assert.match(server, /subject: `\[DO NOT REPLY\] Baggage Case Confirmation – WorldTracer Reference: \$\{fileNumber\}`/);
  assert.match(server, /您的行李案件已成功建立/);
  assert.match(server, /Your baggage case has been successfully created/);
  assert.match(server, /如果您在建案后 7 天内仍未收到我们的进一步通知/);
  assert.match(server, /If you have not received any further updates from us within 7 days/);
  assert.match(server, /mailto:laxllmu@chinaeastern-usa\.com/);
  assert.match(server, /此邮件为系统自动发送，请勿直接回复此邮件/);
  assert.match(server, /This is an automatically generated email\. Please do not reply to this message/);
});

test('requested bags update emails the passenger without an operations CC', () => {
  assert.match(server, /function requestedBagsUpdateEmail/);
  assert.match(server, /your baggage has been located, and a transfer request has been arranged/);
  assert.match(server, /您的行李已经找到，目前已提交转运申请并正在安排转运/);
  assert.match(server, /subject: `行李案件更新通知 – WorldTracer 案件编号：\$\{fileNumber\}`/);
  assert.match(server, /subject: `Baggage Case Update – WorldTracer Reference: \$\{fileNumber\}`/);
  assert.match(server, /WorldTracer Reference Number: \$\{reference\}/);
  assert.match(server, /WorldTracer 案件编号：\$\{reference\}/);
  assert.match(server, /Dear Passenger,\\n\\nWe are pleased to inform you/);
  assert.match(server, /Sincerely,\\nChina Eastern Airlines/);
  assert.match(server, /我们将继续跟进行李的转运状态。如有进一步信息，我们会尽快与您联系并提供最新进展/);
  assert.match(server, /Once further information becomes available, we will contact you as soon as possible with an update/);
  assert.doesNotMatch(server, /including its arrival or pickup\/delivery arrangements/);
  assert.match(server, /function cbsEmailIsChinese[\s\S]*?\^zh\(\?:-\|\$\)/);
  const block = server.match(/if \(updateFields\.updateEvent\?\.key === 'requested_bags'\) \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(block, /sendCbsCaseEmail/);
  assert.match(block, /ccOperations: false/);
  assert.match(block, /record\.worldTracerFileNumber \|\| ''/);
  assert.match(block, /text: message\.text/);
});

test('Baggage transfer ETA Email action emails the passenger using its selected date', () => {
  const helper = server.match(/function rushToLaxInformationEmail[\s\S]*?\n\}/)?.[0] || '';
  assert.match(helper, /请勿回复 – 行李转运状态更新 – WorldTracer 案件编号：\$\{fileNumber\}/);
  assert.match(helper, /DO NOT REPLY – Baggage Transfer Status Update – WorldTracer Case: \$\{fileNumber\}/);
  assert.match(helper, /预计于 \$\{arrival\} 运抵洛杉矶（LAX）/);
  assert.match(helper, /expected to arrive in Los Angeles \(LAX\) on \$\{arrival\}/);
  assert.doesNotMatch(helper, /delivery will be arranged to the address provided in your case/);
  assert.doesNotMatch(helper, /根据您案件中所提供的地址安排后续配送/);
  assert.doesNotMatch(helper, /We sincerely apologize for the inconvenience/);
  assert.doesNotMatch(helper, /感谢您的耐心与理解，并对行李延误给您带来的不便深表歉意/);
  assert.match(server, /transferEtaEmail[\s\S]*?rushToLaxInformationEmail\(record, record\.worldTracerFileNumber \|\| '', estimatedArrivalTime\)/);
  assert.match(server, /CBS baggage transfer ETA email error/);
});

test('passenger-related pickup email requires confirmation before collection or FedEx shipping', () => {
  const helper = server.match(/function passengerRelatedPickupOrFedexEmail[\s\S]*?\n}\n\nfunction signedOpenBagAuthorizationToPvgEmail/)?.[0] || '';
  assert.match(helper, /Baggage Collection \/ Shipping Options – WorldTracer \$\{fileNumber\}/);
  assert.match(helper, /行李领取\/寄送方式确认 – WorldTracer \$\{fileNumber\}/);
  assert.match(helper, /complimentary baggage delivery is not available in this case/);
  assert.match(helper, /Please wait for our confirmation before coming to collect your baggage or arranging a FedEx pick-up/);
  assert.match(helper, /在收到我们的确认通知之前，请勿前往机场领取行李，也请勿提前安排 FedEx 取件/);
  assert.match(helper, /Option 2: FedEx Shipping at Passenger's Expense/);
  assert.match(helper, /选项二：自费 FedEx 寄送/);
  assert.match(helper, /Departures, Counter A68 Office/);
  assert.match(helper, /font-family:Arial/);
  assert.match(helper, /font-size:15px;line-height:1\.6;letter-spacing:0\.1px/);
});

test('DPR WorldTracer updates notify the damaged-baggage Discord channel', () => {
  assert.match(server, /CBS_DAMAGED_DISCORD_CHANNEL_ID[^\n]*'1527344986075693167'/);
  assert.match(server, /CBS_DPR_WORLDTRACER_DISCORD_ROLE_ID[^\n]*'1268619386948685877'/);
  const helper = server.match(/async function sendDprWorldTracerUpdateToDiscord[\s\S]*?\n\}/)?.[0] || '';
  for (const field of ['Passenger Name', 'Bag Tag', 'Email', 'Phone', 'WorldTracer File #']) {
    assert.match(helper, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(helper, /`<@&\$\{CBS_DPR_WORLDTRACER_DISCORD_ROLE_ID\}>`/);
  assert.match(helper, /allowedMentions: \{ parse: \[\], roles: \[CBS_DPR_WORLDTRACER_DISCORD_ROLE_ID\] \}/);
  assert.match(server, /if \(String\(record\.caseType \|\| ''\)\.toUpperCase\(\) === 'DPR'\)/);
  assert.match(server, /sendDprWorldTracerUpdateToDiscord\(record, fileNumber\)/);
});

test('ADC shipping updates email the passenger a bilingual delivery notification', () => {
  assert.match(server, /function adcShippingUpdateEmail/);
  assert.match(server, /行李配送通知 – WorldTracer 案件编号：\$\{fileNumber\}/);
  assert.match(server, /Baggage Delivery Notification – WorldTracer Reference: \$\{fileNumber\}/);
  assert.match(server, /您的行李已安排寄出，并将配送至您在行李案件中所提供的地址/);
  assert.match(server, /your baggage has been shipped and is being delivered to the address you provided/);
  assert.match(server, /value === 'ADC - All Day Courier'/);
  assert.match(server, /CBS ADC shipping update email error/);
  assert.match(server, /配送地址：\$\{address\}/);
  assert.match(server, /Delivery Address: \$\{address\}/);
  assert.match(server, /adcShippingUpdateEmail\(record, fileNumber, shippingAddress\)/);
});

test('FedEx shipping updates email tracking details from the stored shipping columns', () => {
  assert.match(server, /function fedexShippingUpdateEmail/);
  assert.match(server, /您的行李已通过 FedEx 安排寄出/);
  assert.match(server, /your baggage has been shipped via FedEx/);
  assert.match(server, /FedEx Tracking Number：\$\{tracking\}/);
  assert.match(server, /Delivery Address: \$\{address\}/);
  assert.match(server, /fedexShippingUpdateEmail\(record, fileNumber, record\.trackingNumber, record\.shippingAddress\)/);
  assert.match(server, /CBS FedEx shipping update email error/);
});

test('airport pickup sends a bilingual closure email', () => {
  assert.match(server, /function airportPickupClosureEmail/);
  assert.match(server, /行李案件结案通知 – WorldTracer 案件编号：\$\{fileNumber\}/);
  assert.match(server, /Baggage Case Closure Notification – WorldTracer Reference: \$\{fileNumber\}/);
  assert.match(server, /您的行李已于机场领取完毕/);
  assert.match(server, /baggage has been successfully picked up at the airport/);
  assert.match(server, /airportPickupClosureEmail\(record, fileNumber\)/);
  assert.match(server, /CBS airport pickup closure email error/);
});

test('passenger-paid shipping sends a bilingual carrier-responsibility email', () => {
  assert.match(server, /function passengerPaidShippingEmail/);
  assert.match(server, /行李配送通知 – WorldTracer 案件编号：\$\{fileNumber\}/);
  assert.match(server, /Baggage Shipping Notification – WorldTracer Reference: \$\{fileNumber\}/);
  assert.match(server, /您的行李已按照您所提供的配送方式安排寄出/);
  assert.match(server, /baggage has been shipped using the shipping method provided by you/);
  assert.match(server, /passengerPaidShippingEmail\(record, fileNumber\)/);
  assert.match(server, /CBS passenger-paid shipping email error/);
});

test('Lost updates send the passenger email and alert the delayed-baggage Discord role', () => {
  assert.match(server, /function lostBaggageUpdateEmail/);
  assert.match(server, /【请勿回复 】行李遗失案件通知 – WorldTracer 案件编号：\$\{fileNumber\}/);
  assert.match(server, /\[DO NOT REPLY\] Lost Baggage Case Notification – WorldTracer Reference: \$\{fileNumber\}/);
  assert.match(server, /您的行李案件现已由延误行李（Delayed Baggage）转为遗失行李（Lost Baggage）案件/);
  assert.match(server, /changed from a Delayed Baggage case to a Lost Baggage case/);
  assert.match(server, /CBS_LOST_DISCORD_ROLE_ID[^\n]*'1268619386948685877'/);
  assert.match(server, /⚠️ BAGGAGE CASE – LOST/);
  assert.match(server, /Baggage has not been located and the case has been updated from DELAYED → LOST/);
  assert.match(server, /allowedMentions: \{ parse: \[\], roles: \[CBS_LOST_DISCORD_ROLE_ID\] \}/);
});
