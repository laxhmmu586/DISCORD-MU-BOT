const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync: Database } = require('node:sqlite');
const { matches, bodyText, chunks, createService } = require('../ldmCpmMail');
const headers = subject => [{ name: 'From', value: 'LAXHMXH <LAXHMXH@hallmark-aviation.com>' }, { name: 'Subject', value: subject }];
test('matches exact sender with combined or separate CPM and LDM subjects', () => {
  assert.ok(matches(headers('LDM CPM MU583 25OCT')));
  assert.ok(matches(headers('CPM LDM MU583 23OCT')));
  assert.ok(matches(headers('LDM MU583')));
  assert.ok(matches(headers('CPM MU583/29OCT26')));
  assert.equal(matches(headers('MU583 operational update')), false);
  assert.equal(matches(headers('XCPM XLDM MU583')), false);
  assert.equal(matches([{ name: 'From', value: 'laxhmxh@hallmark-aviation.com.evil' }, ...headers('LDM CPM').slice(1)]), false);
});
test('prefers plain body, preserves lines and falls back to HTML', async () => {
  const part = (mimeType, text) => ({ mimeType, body: { data: Buffer.from(text).toString('base64url') } });
  assert.equal(await bodyText({ parts: [part('text/plain', 'LDM\nMU0583'), part('text/html', '<p>duplicate</p>')] }), 'LDM\nMU0583');
  assert.equal(await bodyText(part('text/html', '<p>LDM<br>CPM &amp; SI</p>')), 'LDM\nCPM & SI');
  const long = 'LDM\n' + 'A'.repeat(5000);
  assert.equal(chunks(long).join(''), long);
  assert.ok(chunks(long).every(s => s.length <= 1900));
});

test('forwards standalone CPM and LDM after November 1 and deduplicates each receipt', async t => {
  const db = new Database(':memory:');t.after(() => db.close());
  const start = Date.parse('2026-11-02T15:00:00Z'), sent = [];
  let id = 'cpm', subject = 'CPM MU583/02NOV26', stamp = start + 1000;
  const options = {db, now: () => start, getClient: () => ({userId:'me',gmail:{users:{messages:{
    list: async ({q}) => {
      assert.equal(q, `from:laxhmxh@hallmark-aviation.com {subject:LDM subject:CPM} after:${Math.floor(start / 1000) - 1}`);
      return {data:{messages:[{id}]}};
    },
    get: async () => ({data:{internalDate:String(stamp),payload:{headers:headers(subject),mimeType:'text/plain',body:{data:Buffer.from('Operational content').toString('base64url')}}}})
  }}}}),channel:async()=>({send:async message=>sent.push(message.content)})};
  const service = createService(options);
  await service.poll();await createService(options).poll();
  assert.deepEqual(sent,['CPM MU583/02NOV26\n\nOperational content']);
  id='ldm';subject='LDM MU583/02NOV26';stamp++;
  await service.poll();await createService(options).poll();
  assert.deepEqual(sent,['CPM MU583/02NOV26\n\nOperational content','LDM MU583/02NOV26\n\nOperational content']);
});
test('paginates, retries failed chunks, and persists deduplication across recreation', async () => {
  const db = new Database(':memory:');
  const sent = [];
  let fail = true;
  const mail = { internalDate: '2001', payload: { headers: headers('LDM CPM MU583'), mimeType: 'text/plain', body: { data: Buffer.from('A'.repeat(2500)).toString('base64url') } } };
  const options = { db, now: () => 2000, getClient: () => ({ userId: 'me', gmail: { users: { messages: {
    list: async ({ pageToken }) => ({ data: pageToken ? { messages: [{ id: 'one' }] } : { nextPageToken: 'second' } }),
    get: async () => ({ data: mail })
  } } } }), channel: async () => ({ send: async message => {
    assert.deepEqual(message.allowedMentions, { parse: [] });
    if (sent.length === 1 && fail) { fail = false; throw new Error('network'); }
    sent.push(message.content);
  } }) };
  await assert.rejects(createService(options).poll(), /network/);
  await createService(options).poll();
  assert.equal(sent.length, 2);
  await createService(options).poll();
  assert.equal(sent.length, 2);
  assert.equal(sent.join(''), 'LDM CPM MU583\n\n' + 'A'.repeat(2500));
  db.close();
});
test('only forwards newest receipt across pages and never backfills older mail', async () => {
  const db = new Database(':memory:');
  const sent = [];
  const service = createService({ db, now: () => 1000,
    getClient: () => ({ userId: 'me', gmail: { users: { messages: {
      list: async ({ pageToken }) => ({ data: pageToken ? { messages: [{ id: 'new' }] } : { messages: [{ id: 'old' }], nextPageToken: 'next' } }),
      get: async ({ id }) => ({ data: { internalDate: id === 'new' ? '3000' : '2000', payload: {
        headers: headers('CPM LDM MU583'), mimeType: 'text/plain', body: { data: Buffer.from(id).toString('base64url') }
      } } })
    } } } }), channel: async () => ({ send: async message => sent.push(message.content) }) });
  await service.poll();
  await service.poll();
  assert.deepEqual(sent, ['CPM LDM MU583\n\nnew']);
  db.close();
});

test('removes the LAXOPS signature and Swissport footer while preserving all SI data', async () => {
  const operation = 'CPM\nMU0583/26OCT26\nSI\nBJ IN 36R/41L\nBT IN 34R/35L';
  const disclaimer = 'Important Note: This email is confidential. If you have received this email by error, please notify the sender. Swissport International Ltd. disclaims any liability.';
  for (const footer of ['Regards/LAXOPS/RA\n'+disclaimer, disclaimer, '  regards / LAXOPS / RA\n'+disclaimer]) {
    const payload = {mimeType:'text/plain',body:{data:Buffer.from(operation+'\r\n\r\n'+footer).toString('base64url')}};
    assert.equal(await bodyText(payload), operation);
  }
  const html = '<p>'+operation.replace(/\n/g,'<br>')+'</p><p>Regards/LAXOPS/RA</p><p>'+disclaimer+'</p>';
  assert.equal(await bodyText({mimeType:'text/html',body:{data:Buffer.from(html).toString('base64url')}}),operation);
  assert.equal(await bodyText({mimeType:'text/plain',body:{data:Buffer.from(operation).toString('base64url')}}),operation);
});
