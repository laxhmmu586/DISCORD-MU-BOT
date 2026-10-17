const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const { compareGdPdfText } = require('../gdPdf');
const expectedFlight = { flightNo: 'MU586', flightDate: '11OCT26', aircraftRegistration: 'B7868' };
const declaration = passport => `Marks of Nationality & Registration B7868 Flight No. MU586 Date 2026-10-11\nFLIGHT ROUTING\nPASSPORT NO\n${passport}\nTTL 1`;

const source = fs.readFileSync(require.resolve('../googleDrive'), 'utf8');
function mailbox(text, subject = 'gd-MU586-11OCT2026', filename = 'crew.pdf', extractor = async buffer => buffer.toString(), additionalParts = []) {
  let query;
  const context = {
    Buffer,
    xmlDecode: text => text,
    envFirst: () => '', gmailSearchYmd: () => '2026/10/11',
    buildGdCheckDetailText: () => '',
    collectGmailParts: (payload, predicate) => payload.parts.filter(predicate),
    isGdPdfAttachment: name => name.endsWith('.pdf'),
    extractGdPdfText: extractor, compareGdPdfText,
    isSpreadsheetAttachment: name => /\.(csv|xlsx|xls)$/i.test(name),
    nextDayInfoGmailErrorReason: err => { throw err; },
    getNextDayInfoGmailClient: () => ({ userId: 'me', authMode: 'oauth', gmail: { users: { messages: {
      list: async ({ q }) => { query = q; return { data: { messages: [{ id: 'gd' }] } }; },
      get: async () => ({ data: { id: 'gd', payload: {
        headers: [{ name: 'Subject', value: subject }],
        parts: [{ filename, body: { data: Buffer.from(text).toString('base64url') } }, ...additionalParts]
      } } })
    } } } })
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function stripSpreadsheetCellText('), source.indexOf('function extractXlsxColumnBText(')), context);
  context.extractSpreadsheetText = context.extractDelimitedColumnBText;
  vm.runInContext(source.slice(source.indexOf('function compareGdSpreadsheetCrew('), source.indexOf('function buildGdCheckDetailText(')), context);
  vm.runInContext(source.slice(source.indexOf('async function getGdCheckEmail('), source.indexOf('async function hasNextDayInfoEmail(')), context);
  return { read: () => context.getGdCheckEmail('MU586', '11OCT26', [{ passport: 'E12345678' }], '', expectedFlight), query: () => query };
}

test('GD search accepts the added sender independently of subject and retains legacy subject search', async () => {
  for (const subject of ['gd-MU586-11OCT2026', 'FYI', 'GD for MU586/11OCT26']) {
    const inbox = mailbox(declaration('E12345678'), subject);
    assert.equal((await inbox.read()).complete, true);
    assert.equal(inbox.query(), '{subject:"GD for MU586/11OCT26" from:xldou@ceair.com} newer_than:2d has:attachment');
  }
});

test('sender candidate still requires all CWD passport numbers to match', async () => {
  const result = await mailbox(declaration('E87654321')).read();
  assert.equal(result.complete, false);
  assert.equal(result.matched, 0);
});


test('unidentified spreadsheets cannot pass the fallback check', async () => {
  const result = await mailbox('1,E12345678', 'FYI', 'crew.csv').read();
  assert.equal(result.complete, false);
  assert.match(result.reason, /no PDF/);
});

const sheet = passport => ({ filename: 'crew.csv', body: { data: Buffer.from(`1,${passport}`).toString('base64url') } });

test('unreadable PDF falls back to spreadsheet B column', async () => {
  const result = await mailbox('broken', 'GD for MU586/11OCT26', 'bad.pdf', async () => { throw new Error('no readable text'); }, [sheet('E12345678')]).read();
  assert.equal(result.complete, true);
  assert.equal(result.attachmentType, 'Spreadsheet B column');
  assert.match(result.fallbackReason, /could not be read/);
  assert.equal(result.checkedAttachments.length, 2);
});

test('missing PDF falls back to legacy spreadsheet check for the correct flight and date', async () => {
  const result = await mailbox('1,E12345678', 'gd-MU586-11OCT2026', 'crew.csv').read();
  assert.equal(result.complete, true);
  assert.match(result.fallbackReason, /No PDF/);
  assert.equal((await mailbox('1,E12345678', 'GD for MU578/11OCT26', 'crew.csv').read()).complete, false);
  assert.equal((await mailbox('1,E12345678', 'GD for MU586/12OCT26', 'crew.csv').read()).complete, false);
});

test('readable PDF mismatch cannot be overridden by matching Excel', async () => {
  const result = await mailbox(declaration('E87654321'), 'GD for MU586/11OCT26', 'crew.pdf', async buffer => buffer.toString(), [sheet('E12345678')]).read();
  assert.equal(result.complete, false);
  assert.equal(result.attachmentType, 'PDF');
  assert.equal(result.checkedAttachments.length, 1);
});

test('fallback requires exact passport tokens in column B', async () => {
  for (const text of ['1,E123456789', 'E12345678,other', '1,other']) {
    assert.equal((await mailbox(text, 'GD for MU586/11OCT26', 'crew.csv').read()).complete, false);
  }
});

test('matching passports cannot pass a mismatched flight header', async () => {
  const result = await mailbox(declaration('E12345678').replace('B7868', 'B9999')).read();
  assert.equal(result.matched, 1);
  assert.equal(result.complete, false);
  assert.match(result.reason, /aircraftRegistration/);
});

test('an unreadable PDF does not prevent checking the next PDF', async () => {
  const result = await mailbox('broken', 'FYI', 'bad.pdf', async buffer => {
    if (buffer.toString() === 'broken') throw new Error('invalid PDF');
    return buffer.toString();
  }, [{ filename: 'good.pdf', body: { data: Buffer.from(declaration('E12345678')).toString('base64url') } }]).read();
  assert.equal(result.complete, true);
  assert.equal(result.checkedAttachments.length, 2);
});

test('unreadable PDF is reported as incomplete', async () => {
  const result = await mailbox('broken', 'FYI', 'bad.pdf', async () => { throw new Error('invalid PDF'); }).read();
  assert.equal(result.complete, false);
  assert.match(result.reason, /PDF could not be read/);
});
