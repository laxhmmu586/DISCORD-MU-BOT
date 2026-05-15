const {

  passengers,

  parseIncrementalLog,

  findBySeat,

  findByName,

  findByFFNumber

} = require('./flightParser');

const {

  parsePDLog,

  findPDByFFNumber

} = require('./pdParser');

const {

  getLatestFlightLog

} = require('./googleDrive');

// ===============================
// Membership Status
// ===============================
function getMembershipStatus(pax) {

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
    return 'Regular';
  }

  return pax.ffTier;
}

// ===============================
// Create Discord Embed
// ===============================
function createPassengerEmbed(pax) {

  if (!pax) {

    return {

      title:
        'Passenger Not Found',

      color:
        0xff0000
    };
  }

  return {

    color:
      pax.lounge?.eligible
        ? 0x00cc99
        : 0xff9900,

    title:
      `${pax.flight}/${pax.flightDate}`,

    description:
      `👤 ${pax.name}\n🎫 BN${pax.bn} | ${pax.seat} | ${pax.cabin} Class`,

    fields: [

      {

        name:
          '💳 Membership',

        value:
`${pax.ffCarrier || 'NONE'} ${pax.ffNumber || ''}
${getMembershipStatus(pax)}`,

        inline:
          true
      },

      {

        name:
          '🎟 Ticket',

        value:
          pax.ticketNumber || 'NONE',

        inline:
          true
      },

      {

        name:
          '🧳 Bags',

        value:
          pax.bagtags?.length
            ? pax.bagtags.join('\n')
            : 'NONE',

        inline:
          false
      },

      {

        name:
          '🛋 Lounge Entitle',

        value:
          pax.lounge?.eligible
            ? '✅ Eligible'
            : '❌ Not Eligible',

        inline:
          true
      },

      {

        name:
          '👥 Lounge Guest',

        value:
          pax.lounge?.guest
            ? '✅ Allowed'
            : '❌ Not Allowed',

        inline:
          true
      }

    ],

    footer: {

      text:
        'MU Lounge Validation'
    }
  };
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

        parsePDLog(log);

        // ===========================
        // FB QUERY
        // ===========================
        if (
          text.startsWith('FB')
        ) {

          const rawBn =
            text
              .replace('FB', '')
              .trim();

          const bn =
            rawBn.padStart(3, '0');

          const pax =
            passengers[bn];

          return message.reply({

            embeds: [

              createPassengerEmbed(pax)

            ]

          });
        }

        // ===========================
        // Seat Query
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

          return message.reply({

            embeds: [

              createPassengerEmbed(pax)

            ]

          });
        }

        // ===========================
        // Name Query
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

          return message.reply({

            embeds: [

              createPassengerEmbed(pax)

            ]

          });
        }

        // ===========================
        // Membership Query
        // ===========================
        if (
          text.startsWith('FF')
        ) {

          const ff =
            text
              .replace('FF', '')
              .trim();

          let pax =
            findByFFNumber(ff);

          if (!pax) {

            pax =
              findPDByFFNumber(ff);
          }

          return message.reply({

            embeds: [

              createPassengerEmbed(pax)

            ]

          });
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