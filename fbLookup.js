const {

  passengers,

  findBySeat,

  findByName

} = require('./flightParser');

// ===============================
// Format Passenger
// ===============================
function formatPassenger(pax) {

  if (!pax) {
    return 'Passenger not found.';
  }

  return `
${pax.name}

BN${pax.bn}

Seat:
${pax.seat}

Cabin:
${pax.cabin}

Booking Class:
${pax.bookingClass}

Boarded:
${pax.boarded ? 'YES' : 'NO'}

FF:
${pax.ffTier || 'N/A'}/*${pax.elite || 0}

Lounge:
${pax.lounge?.eligible ? '✅ Eligible' : '❌ Not Eligible'}
${pax.lounge?.guest ? '✅ Guest Allowed' : '❌ No Guest'}

Reason:
${pax.lounge?.reason || 'N/A'}

Special Service:
${pax.specialServices?.length
  ? pax.specialServices.join(', ')
  : 'NONE'
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
        // FB QUERY
        // ===========================
        // FB085
        // FB 085
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
        // FSN32H
        // FSN 32H
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
        // RNLI/WAND
        // RN LI/WAND
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

          const boarded =
            paxList.filter(
              p => p.boarded
            ).length;

          const lounge =
            paxList.filter(
              p => p.lounge?.eligible
            ).length;

          const vip =
            paxList.filter(
              p =>
                p.specialServices?.includes('VIP')
            ).length;

          const wchr =
            paxList.filter(
              p =>
                p.specialServices?.includes('WCHR')
            ).length;

          return message.reply(`
Flight Stats

Passengers:
${total}

Boarded:
${boarded}

Lounge Eligible:
${lounge}

VIP:
${vip}

WCHR:
${wchr}
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