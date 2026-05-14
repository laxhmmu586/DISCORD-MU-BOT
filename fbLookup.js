const {

  passengers,

  parseIncrementalLog,

  findBySeat,

  findByName

} = require('./flightParser');

const {

  getLatestFlightLog

} = require('./googleDrive');

// ===============================
// FF Status
// ===============================
function getFFStatus(pax) {

  if (!pax.ffTier) {
    return 'NONE';
  }

  // Regular Member
  if (pax.ffTier === 'C') {
    return 'Regular / C';
  }

  let tier = '';

  if (pax.ffTier === 'V') {
    tier = 'Platinum';
  }

  else if (pax.ffTier === 'G') {
    tier = 'Gold';
  }

  else if (pax.ffTier === 'S') {
    tier = 'Silver';
  }

  return `${tier} /*${pax.elite}`;
}

// ===============================
// Format Passenger
// ===============================
function formatPassenger(pax) {

  if (!pax) {
    return 'Passenger not found.';
  }

  return `
${pax.flight}/${pax.flightDate}

${pax.name}
BN${pax.bn} | ${pax.seat}

FF:
${pax.ffCarrier || ''} ${pax.ffNumber || 'NONE'}
${getFFStatus(pax)}

TKT:
${pax.ticketNumber || 'NONE'}

BAG:
${pax.bagtags?.length
  ? pax.bagtags.join('\n')
  : 'NONE'
}

LOUNGE GUEST:
${pax.lounge?.eligible
  ? (
      pax.lounge?.guest
      ? '✅ Allowed'
      : '❌ Not Allowed'
    )
  : '❌ Not Allowed'
}
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
        // Download Latest Log
        // ===========================
        const log =
          await getLatestFlightLog();

        if (!log) {

          return message.reply(
            'Unable to load Flight Control.log'
          );
        }

        // ===========================
        // Parse Latest Log
        // ===========================
        parseIncrementalLog(log);

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

          const platinum =
            paxList.filter(
              p => p.ffTier === 'V'
            ).length;

          const gold =
            paxList.filter(
              p => p.ffTier === 'G'
            ).length;

          return message.reply(`
${paxList[0]?.flight || 'MU586'}/${paxList[0]?.flightDate || 'UNKNOWN'}

TOTAL: ${total}

LOUNGE: ${lounge}

PLATINUM: ${platinum}

GOLD: ${gold}
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