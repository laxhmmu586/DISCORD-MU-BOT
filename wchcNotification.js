const DEFAULT_CHANNEL_IDS = ['1252031811970666618', '1252032370920656907'];
const DEFAULT_ROLE_ID = '1252026975279906876';
const FOOTER_PREFIX = 'WCHC Alert • ';

function passengerKey(passenger) {
  return [passenger.flight, passenger.flightDate, passenger.bn]
    .map((value) => String(value || '').trim().toUpperCase())
    .join('|');
}

function createAlertEmbed(passenger) {
  const bags = Array.isArray(passenger.bagtags) ? passenger.bagtags.filter(Boolean) : [];
  const fields = [
    { name: '👤 Passenger', value: passenger.name || '—', inline: false },
    { name: '🎫 Flight / Date', value: `${passenger.flight || '—'}/${passenger.flightDate || '—'}`, inline: true },
    { name: '💺 Boarding / Seat / Cabin', value: `BN${passenger.bn || '—'} • ${passenger.seat || '—'} • ${passenger.cabin || '—'}`, inline: true },
    ...(passenger.ticketNumber ? [{ name: '🎟 Ticket', value: String(passenger.ticketNumber), inline: false }] : []),
    ...(bags.length ? [{ name: '🧳 Bags', value: bags.join('\n'), inline: false }] : []),
    ...(passenger.outbound ? [{
      name: '➡ Outbound',
      value: `${passenger.outbound.flight || '—'}/${passenger.outbound.date || '—'}${passenger.outbound.bn ? ` • BN${passenger.outbound.bn}` : ''}${passenger.outbound.seat ? ` • ${passenger.outbound.seat}` : ''}\nTo ${passenger.outbound.destination || '—'}`,
      inline: false
    }] : []),
    { name: '🧩 Special Service', value: 'WCHC', inline: false }
  ];
  return {
    color: 0xf59e0b,
    title: '⚠️ WCHC Passenger Alert',
    fields,
    footer: { text: `${FOOTER_PREFIX}${passengerKey(passenger)}` },
    timestamp: new Date().toISOString()
  };
}

function alertKeyFromMessage(message, botUserId) {
  if (botUserId && message.author?.id !== botUserId) return '';
  const footer = message.embeds?.[0]?.footer?.text || '';
  return footer.startsWith(FOOTER_PREFIX) ? footer.slice(FOOTER_PREFIX.length) : '';
}

function createWchcNotifier(client, options = {}) {
  const channelIds = options.channelIds || DEFAULT_CHANNEL_IDS;
  const roleId = options.roleId || DEFAULT_ROLE_ID;
  let running = false;

  return async function reconcile(passengers) {
    if (running || !client.user) return;
    running = true;
    try {
      const active = new Map(Object.values(passengers || {})
        .filter((passenger) => passenger.specialServices?.includes('WCHC'))
        .map((passenger) => [passengerKey(passenger), passenger]));

      for (const channelId of channelIds) {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isTextBased()) throw new Error(`WCHC channel ${channelId} is unavailable`);
        const recent = await channel.messages.fetch({ limit: 100 });
        const existing = new Map();
        for (const message of recent.values()) {
          const key = alertKeyFromMessage(message, client.user.id);
          if (key) existing.set(key, message);
        }
        for (const [key, message] of existing) {
          if (!active.has(key)) await message.delete();
        }
        for (const [key, passenger] of active) {
          if (existing.has(key)) continue;
          await channel.send({
            content: `<@&${roleId}>`,
            embeds: [createAlertEmbed(passenger)],
            allowedMentions: { parse: [], roles: [roleId] }
          });
        }
      }
    } finally {
      running = false;
    }
  };
}

module.exports = { createAlertEmbed, createWchcNotifier, passengerKey, alertKeyFromMessage, FOOTER_PREFIX };
