const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('WorldTracer update email does not regenerate or attach a PDF report', () => {
  const updateEmailBlock = server.match(/if \(updateFields\.updateEvent\?\.key === 'worldtracer'\) \{([\s\S]*?)\n\s*\}\n\s*return res\.json/)?.[1] || '';
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
  assert.match(server, /We are pleased to inform you that your baggage has been located/);
  assert.match(server, /我们很高兴地通知您，您的行李已找到，目前正在安排转运中/);
  assert.match(server, /subject: `行李案件更新通知 – WorldTracer 案件编号：\$\{fileNumber\}`/);
  assert.match(server, /subject: `Baggage Case Update – WorldTracer Reference: \$\{fileNumber\}`/);
  assert.match(server, /WorldTracer Reference Number: \$\{reference\}/);
  assert.match(server, /WorldTracer 案件编号：\$\{reference\}/);
  assert.match(server, /Dear Passenger,\\n\\nWe are pleased to inform you/);
  assert.match(server, /Sincerely,\\nChina Eastern Airlines/);
  assert.match(server, /后续行李将按照您在行李报失记录（Report）中登记的地址安排配送/);
  assert.match(server, /如无需更改配送地址，则无需回复此邮件/);
  assert.match(server, /Your baggage will be delivered to the address currently listed in your baggage report/);
  assert.match(server, /If no address change is needed, no reply is required/);
  assert.doesNotMatch(server, /including its arrival or pickup\/delivery arrangements/);
  assert.match(server, /function cbsEmailIsChinese[\s\S]*?\^zh\(\?:-\|\$\)/);
  const block = server.match(/if \(updateFields\.updateEvent\?\.key === 'requested_bags'\) \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(block, /sendCbsCaseEmail/);
  assert.match(block, /ccOperations: false/);
  assert.match(block, /record\.worldTracerFileNumber \|\| ''/);
  assert.match(block, /text: message\.text/);
});

test('DPR WorldTracer updates notify the damaged-baggage Discord channel', () => {
  assert.match(server, /CBS_DAMAGED_DISCORD_CHANNEL_ID[^\n]*'1527344986075693167'/);
  const helper = server.match(/async function sendDprWorldTracerUpdateToDiscord[\s\S]*?\n\}/)?.[0] || '';
  for (const field of ['Passenger Name', 'Bag Tag', 'Email', 'Phone', 'WorldTracer File #']) {
    assert.match(helper, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(helper, /allowedMentions: \{ parse: \[\] \}/);
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
