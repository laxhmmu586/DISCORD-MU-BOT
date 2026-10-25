const test = require('node:test');
const assert = require('node:assert/strict');
const { createSendMessageHandler } = require('../sendMessageApi');

const pdf = Buffer.from('%PDF-1.4\nattachment test');
const file = () => ({ name: 'MU586 BRIEFING SHEET.pdf',
  contentType: 'application/pdf', base64: pdf.toString('base64') });

function harness({ skip = false, sendError = false, missingChannel = false,
  omitAttachment = false } = {}) {
  const sends = [];
  let fetches = 0;
  const handler = createSendMessageHandler({
    client: { channels: { fetch: async () => {
      fetches++;
      return missingChannel ? null : { send: async options => {
        sends.push(options);
        if (sendError) throw new Error('Discord rejected upload');
        return { id: 'message-123', attachments: new Map(
          omitAttachment ? [] : (options.files || []).map((v, i) => [i, v])) };
      } };
    } } },
    etabAdvisory: { isLegacyEtabRequest: () => skip },
    removeBoardingLinesFromDiscordEmbedText: text => (text || '').replace('BOARDING', ''),
    removeBoardingLinesFromDiscordEmbeds: embeds => embeds.map(e => ({ ...e, cleaned: true }))
  });
  async function request(body) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; } };
    await handler({ body }, res);
    return res;
  }
  return { sends, request, fetches: () => fetches };
}

test('uploads exact PDF bytes and filename and confirms Discord attachment', async () => {
  const h = harness();
  const res = await h.request({ channelId: '123', message: 'Briefing', file: file() });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, messageId: 'message-123', attachmentCount: 1 });
  assert.deepEqual(h.sends[0].files, [{ attachment: pdf, name: file().name }]);
  assert.equal(h.sends[0].content, 'Briefing');
});

test('retains text/embed sanitization and ETAB suppression', async () => {
  const h = harness();
  await h.request({ channelId: '123', message: 'BOARDINGBriefing', embeds: [{ title: 'Notice' }] });
  assert.deepEqual(h.sends, [{ content: 'Briefing', embeds: [{ title: 'Notice', cleaned: true }] }]);
  const skipped = harness({ skip: true });
  assert.equal((await skipped.request({ channelId: '123', message: 'ETAB' })).body.skipped, true);
  assert.equal(skipped.fetches(), 0);
});

test('legacy briefing script calls cannot duplicate system-managed briefing posts',async()=>{
 const h=harness();const res=await h.request({channelId:'1252032370920656907',file:file()});
 assert.equal(res.body.skipped,true);assert.equal(h.fetches(),0);assert.equal(h.sends.length,0);
});

test('rejects malformed attachment data before accessing Discord', async () => {
  const invalidFiles = [null, {}, { ...file(), name: '../briefing.pdf' },
    { ...file(), name: 'briefing\n.pdf' }, { ...file(), name: 'briefing.txt' },
    { ...file(), contentType: 'text/plain' }, { ...file(), base64: 'broken' },
    { ...file(), base64: Buffer.from('<html>Error</html>').toString('base64') },
    { ...file(), base64: file().base64 + '\n' }];
  for (const invalid of invalidFiles) {
    const h = harness();
    assert.equal((await h.request({ channelId: '123', message: 'Briefing', file: invalid })).statusCode, 400);
    assert.equal(h.fetches(), 0);
  }
  const h = harness();
  const large = { ...file(), base64: 'A'.repeat(4 * Math.ceil(8 * 1024 * 1024 / 3) + 4) };
  assert.equal((await h.request({ channelId: '123', file: large })).statusCode, 413);
  assert.equal(h.fetches(), 0);
});

test('reports missing inputs, channels, upload failures and missing attachment confirmation', async () => {
  assert.equal((await harness().request({ message: 'test' })).statusCode, 400);
  assert.equal((await harness().request({ channelId: '123' })).statusCode, 400);
  assert.equal((await harness({ missingChannel: true }).request({ channelId: '123', message: 'test' })).statusCode, 404);
  assert.equal((await harness({ sendError: true }).request({ channelId: '123', file: file() })).statusCode, 500);
  const res = await harness({ omitAttachment: true }).request({ channelId: '123', file: file() });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.messageId, 'message-123');
});
