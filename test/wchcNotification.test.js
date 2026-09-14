const test = require('node:test');
const assert = require('node:assert/strict');
const { createAlertEmbed, createWchcNotifier, passengerKey } = require('../wchcNotification');

const passenger = {
  flight: 'MU586', flightDate: '13SEP', bn: '107', name: 'LIGAJIM/FRANCISCA',
  seat: '67C', cabin: 'Economy', ticketNumber: '7817509316121',
  bagtags: ['0781747442/BKI'], specialServices: ['WCHC']
};

test('WCHC alert contains passenger details and a stable reconciliation key', () => {
  const embed = createAlertEmbed(passenger);
  assert.equal(passengerKey(passenger), 'MU586|13SEP|107');
  assert.match(embed.fields.map((field) => `${field.name} ${field.value}`).join('\n'), /LIGAJIM\/FRANCISCA[\s\S]*67C[\s\S]*7817509316121[\s\S]*WCHC/);
  assert.match(embed.footer.text, /MU586\|13SEP\|107$/);
});

test('reconciler posts WCHC to both channels and mentions the configured role', async () => {
  const sent = [];
  const client = { user: { id: 'bot' }, channels: { fetch: async (id) => ({
    isTextBased: () => true,
    messages: { fetch: async () => new Map() },
    send: async (payload) => sent.push({ id, payload })
  }) } };
  await createWchcNotifier(client, { channelIds: ['one', 'two'], roleId: 'role' })({ 107: passenger });
  assert.deepEqual(sent.map((entry) => entry.id), ['one', 'two']);
  assert.ok(sent.every((entry) => entry.payload.content === '<@&role>'));
});

test('reconciler deletes an alert after WCHC changes or is removed', async () => {
  let deleted = 0;
  const oldMessage = {
    author: { id: 'bot' }, embeds: [{ footer: { text: 'WCHC Alert • MU586|13SEP|107' } }],
    delete: async () => { deleted += 1; }
  };
  const client = { user: { id: 'bot' }, channels: { fetch: async () => ({
    isTextBased: () => true,
    messages: { fetch: async () => new Map([['message', oldMessage]]) },
    send: async () => assert.fail('must not send a replacement alert')
  }) } };
  await createWchcNotifier(client, { channelIds: ['one'] })({ 107: { ...passenger, specialServices: ['WCHR'] } });
  assert.equal(deleted, 1);
});

test('reconciler edits the original embed when passenger details change', async () => {
  let editedPayload = null;
  let sent = 0;
  const originalEmbed = createAlertEmbed({ ...passenger, seat: '66A' });
  const oldMessage = {
    author: { id: 'bot' }, content: '<@&role>', embeds: [originalEmbed],
    edit: async (payload) => { editedPayload = payload; },
    delete: async () => assert.fail('active WCHC alert must not be deleted')
  };
  const client = { user: { id: 'bot' }, channels: { fetch: async () => ({
    isTextBased: () => true,
    messages: { fetch: async () => new Map([['message', oldMessage]]) },
    send: async () => { sent += 1; }
  }) } };
  await createWchcNotifier(client, { channelIds: ['one'], roleId: 'role' })({ 107: passenger });
  assert.equal(sent, 0);
  assert.match(editedPayload.embeds[0].fields.map((field) => field.value).join('\n'), /67C/);
});

test('reconciler leaves an unchanged embed untouched', async () => {
  let edits = 0;
  const oldMessage = {
    author: { id: 'bot' }, content: '<@&role>', embeds: [createAlertEmbed(passenger)],
    edit: async () => { edits += 1; }, delete: async () => assert.fail('must not delete')
  };
  const client = { user: { id: 'bot' }, channels: { fetch: async () => ({
    isTextBased: () => true,
    messages: { fetch: async () => new Map([['message', oldMessage]]) },
    send: async () => assert.fail('must not send')
  }) } };
  await createWchcNotifier(client, { channelIds: ['one'], roleId: 'role' })({ 107: passenger });
  assert.equal(edits, 0);
});
