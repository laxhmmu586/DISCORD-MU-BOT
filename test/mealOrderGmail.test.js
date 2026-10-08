const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseMealOrderEmail, parseSpmlLog } = require('../spmlParser');

const { buildMealOrderGmailQuery } = require('../googleDrive');
const octoberOrder = fs.readFileSync(require.resolve('./fixtures/meal-order-08oct26.txt'), 'utf8');
const nilLog = fs.readFileSync(require.resolve('./fixtures/spml-nil-08oct26.txt'), 'utf8');

// Exercise the production Gmail selection and MIME decoding with a fake mailbox.
const gmailSource = fs.readFileSync(require.resolve('../googleDrive'), 'utf8');
function mailbox(bodies) {
  const calls = [];
  const context = { Buffer, parseMealOrderEmail,
    nextDayInfoGmailErrorReason: err => { throw err; },
    getNextDayInfoGmailClient: () => ({ userId:'me', authMode:'oauth', gmail:{ users:{ messages:{
      list: async () => ({ data:{ messages:bodies.map((_, i) => ({ id:String(i) })) } }),
      get: async ({ id }) => {
        calls.push(id);
        return { data:{ id, internalDate:String(Date.UTC(2026, 9, 8) - Number(id) * 1000), payload:{
          mimeType:'text/plain', headers:[{ name:'Subject', value:'CHINA EASTERN AIRLINES - FINAL Meal Order For MU586/08OCT26' }],
          body:{ data:Buffer.from(bodies[Number(id)]).toString('base64url') }
        } } };
      }
    } } } })
  };
  vm.createContext(context);
  vm.runInContext(gmailSource.slice(gmailSource.indexOf('function decodeGmailBody('), gmailSource.indexOf('function parseNextDayInfoDetails(')), context);
  return { calls, read: () => context.getLatestMealOrderEmail('MU586', '08OCT26') };
}

test('08OCT26 regular meal order is found with an empty PD SPML list', async () => {
  const email = await mailbox([octoberOrder]).read();
  assert.equal(email.found, true);
  assert.deepEqual(email.cabinCounts, { F:6, J:52, Y:255 });
  assert.deepEqual(email.countsByCabin, { F:{}, J:{}, Y:{} });
  const pd = parseSpmlLog(nilLog, { flightNo:'MU586', flightDate:'08OCT26' });
  assert.deepEqual(pd.preorder, []);
  assert.deepEqual(pd.preorderByCabin, email.countsByCabin);
});

test('a revision removing all special meals takes precedence over an older order', async () => {
  const inbox = mailbox([octoberOrder, octoberOrder.replace('Y - 255', 'Y - 250 + 5 SFML = 255')]);
  const email = await inbox.read();
  assert.equal(email.found, true);
  assert.equal(email.messageId, '0');
  assert.deepEqual(email.counts, {});
  assert.deepEqual(inbox.calls, ['0']);
});

test('zero quantities, premium-only SPML and BBML-only orders are valid', async () => {
  for (const body of ['F - 0\nC - 0\nY - 0', 'F - 6 + 1 SFML\nJ - 52\nY - 255', 'F - 6\nC - 52\nY - 255 + 3 BBML']) {
    const email = await mailbox([body]).read();
    assert.equal(email.found, true);
    assert.deepEqual(email.counts, {});
  }
});

test('subject-only, booking-only and incomplete orders are not accepted', async () => {
  for (const body of ['', 'Please see attached.', 'PASSENGER BOOKING FOR MU586/08OCT26:\nF - 2\nC - 56\nY - 252',
    'F - 6\nC - 52\nPASSENGER BOOKING FOR MU586/08OCT26:\nF - 2\nC - 56\nY - 252']) {
    assert.equal((await mailbox([body]).read()).found, false);
  }
});

test('meal-order search includes messages sent from the monitored mailbox to itself', () => {
  assert.equal(
    buildMealOrderGmailQuery('MU586', '12SEP26'),
    '{from:laxapmu@chinaeastern-usa.com from:laxhmmu@gmail.com} subject:"Meal Order for MU586/12SEP26" newer_than:7d'
  );
});

test('meal-order search strips quotes from subject components', () => {
  assert.equal(
    buildMealOrderGmailQuery('MU"586', '12SEP"26'),
    '{from:laxapmu@chinaeastern-usa.com from:laxhmmu@gmail.com} subject:"Meal Order for MU586/12SEP26" newer_than:7d'
  );
});
