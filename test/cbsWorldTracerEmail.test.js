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

test('requested bags update emails the passenger without an operations CC', () => {
  assert.match(server, /function requestedBagsUpdateEmail/);
  assert.match(server, /We are pleased to inform you that your baggage has been located/);
  const block = server.match(/if \(updateFields\.updateEvent\?\.key === 'requested_bags'\) \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(block, /sendCbsCaseEmail/);
  assert.match(block, /ccOperations: false/);
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
