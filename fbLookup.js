const {

  passengers,

  findBySeat,

  findByName

} = require('./flightParser');

// ===============================
// FF Status
// ===============================
function getFFStatus(pax) {

  if (!pax.ffTier) {
    return 'NONE';
  }

  if (pax.ffTier === 'V') {
    return 'Platinum';
  }

  if (pax.ffTier === 'G') {
    return 'Gold';
  }

  if (pax.ffTier === 'S') {
    return 'Silver';
  }

  if (pax.ffTier === 'C') {
    return 'Classic';
  }

  return pax.ffTier;
}

// ===============================
// Format Passenger
// ===============================
function formatPassenger(pax) {

  if (!pax) {
    return 'Passenger not found.';
  }

  return `
MU586/08MAY

NAME:
${pax.name}

BN:
${pax.bn}

SEAT:
${pax.seat}

BAGTAG:
${pax.bagtags?.length
  ? pax.bagtags.join('\n')
  : 'NONE'
}

FF NUMBER:
${pax.ffNumber || 'NONE'}

FF STATUS:
${getFFStatus(pax)}

TICKET NUMBER:
${pax.ticketNumber || 'NONE'}

LOUNGE:
${pax.lounge?.eligible
  ? '✅ Eligible'
  : '❌ Not Eligible'
}

${pax.lounge?.guest
  ? '✅ Guest Allowed'
  : '❌ No Guest'}
`;
}

// ===============================
// Export
// ===============================
module.exports = function(client) {

  client.on(
    'messageCreate',
    async (message) => {

      try {

        // Ignore bots
        if (message.author.bot) {
          return;
        }

        const text =
          message.content
            .trim()
            .toUpperCase();

        // ===========================
        // FB QUERY
        // ===========================
        if (
          text.startsWith('FB')
        ) {

          const bn =
            text
              .replace('FB', '')
              .trim();

          const pax =
            passengers[bn];

          return message.reply(
            formatPassenger(pax)
          );
        }

        // ===========================
        // FSN QUERY
        // ===========================
        if (
          text.startsWith('FSN')
        ) {

          const seat =
            text
              .replace('FSN', '')
              .trim();

          const pax =
            findBySeat(seat);

          return message.reply(
            formatPassenger(pax)
          );
        }

        // ===========================
        // RN QUERY
        // ===========================
        if (
          text.startsWith('RN')
        ) {

          const name =
            text
              .replace('RN', '')
              .trim();

          const pax =
            findByName(name);

          return message.reply(
            formatPassenger(pax)
          );
        }

        // ===========================
        // STATS
        // ===========================
        if (
          text === 'STATS'
        ) {

          const paxList =
            Object.values(passengers);

          const total =
            paxList.length;

          const lounge =
            paxList.filter(
              p => p.lounge?.eligible
            ).length;

          return message.reply(`
MU586 STATS

TOTAL:
${total}

LOUNGE:
${lounge}
`);
        }

      } catch (err) {

        console.error(err);

        message.reply(
          'ERROR'
        );
      }
    }
  );
};