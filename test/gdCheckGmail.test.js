const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../googleDrive'), 'utf8');
function mailbox(text, subject = 'gd-MU586-11OCT2026') {
  let query;
  const context = {
    Buffer,
    envFirst: () => '', gmailSearchYmd: () => '2026/10/11',
    buildGdCheckDetailText: () => '',
    collectGmailParts: (payload, predicate) => payload.parts.filter(predicate),
    isSpreadsheetAttachment: name => name.endsWith('.csv'),
    gdAttachmentType: () => 'CSV',
    extractSpreadsheetText: buffer => buffer.toString(),
    nextDayInfoGmailErrorReason: err => { throw err; },
    getNextDayInfoGmailClient: () => ({ userId: 'me', authMode: 'oauth', gmail: { users: { messages: {
      list: async ({ q }) => { query = q; return { data: { messages: [{ id: 'gd' }] } }; },
      get: async () => ({ data: { id: 'gd', payload: {
        headers: [{ name: 'Subject', value: subject }],
        parts: [{ filename: 'crew.csv', body: { data: Buffer.from(text).toString('base64url') } }]
      } } })
    } } } })
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function normalizeGdComparable('), source.indexOf('function buildGdCheckDetailText(')), context);
  vm.runInContext(source.slice(source.indexOf('async function getGdCheckEmail('), source.indexOf('async function hasNextDayInfoEmail(')), context);
  return { read: () => context.getGdCheckEmail('MU586', '11OCT26', [{ passport: 'E12345678' }]), query: () => query };
}

test('GD search accepts the added sender independently of subject and retains legacy subject search', async () => {
  for (const subject of ['gd-MU586-11OCT2026', 'FYI', 'GD for MU586/11OCT26']) {
    const inbox = mailbox('E12345678', subject);
    assert.equal((await inbox.read()).complete, true);
    assert.equal(inbox.query(), '{subject:"GD for MU586/11OCT26" from:xldou@ceair.com} newer_than:2d has:attachment');
  }
});

test('sender candidate still requires all CWD passport numbers to match', async () => {
  const result = await mailbox('E87654321').read();
  assert.equal(result.complete, false);
  assert.equal(result.matched, 0);
});
