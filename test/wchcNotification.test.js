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
