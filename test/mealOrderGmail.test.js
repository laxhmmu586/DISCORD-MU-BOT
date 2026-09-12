const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMealOrderGmailQuery } = require('../googleDrive');

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
