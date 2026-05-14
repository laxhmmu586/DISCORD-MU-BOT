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
// Create Embed
// ===============================
function createPassengerEmbed(pax) {

  if (!pax) {

    return {

      title:
        'Passenger Not Found',

      description:
        'No matching passenger record found.',

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
      `👤 ${pax.name}\n🎫 BN${pax.bn} | ${pax.seat}`,

    fields: [

      {

        name: '💳 FF',

        value:
`${pax.ffCarrier || 'NONE'} ${pax.ffNumber || ''}
${getFFStatus(pax)}`,

        inline: true
      },

      {

        name: '🎟 Ticket',

        value:
          pax.ticketNumber || 'NONE',

        inline: true
      },

      {

        name: '🧳 Bags',

        value:
          pax.bagtags?.length
            ? pax.bagtags.join('\n')
            : 'NONE',

        inline: false
      },

      {

        name: '🛋 Lounge Guest',

        value:
          pax.lounge?.eligible
            ? (
                pax.lounge?.guest
                ? '✅ Allowed'
                : '❌ Not Allowed'
              )
            : '❌ Not Allowed',

        inline: false
      }

    ],

    footer: {

      text:
        'China Eastern Flight Control'
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

          return message.reply({

            embeds: [

              createPassengerEmbed(pax)

            ]

          });
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

          return message.reply({

            embeds: [

              createPassengerEmbed(pax)

            ]

          });
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

          return message.reply({

            embeds: [

              {

                color:
                  0x0099ff,

                title:
                  `${paxList[0]?.flight || 'MU586'}/${paxList[0]?.flightDate || 'UNKNOWN'}`,

                fields: [

                  {

                    name: '👥 Total',

                    value:
                      String(total),

                    inline: true
                  },

                  {

                    name: '🛋 Lounge',

                    value:
                      String(lounge),

                    inline: true
                  },

                  {

                    name: '💎 Platinum',

                    value:
                      String(platinum),

                    inline: true
                  },

                  {

                    name: '🥇 Gold',

                    value:
                      String(gold),

                    inline: true
                  }

                ],

                footer: {

                  text:
                    'China Eastern Flight Control'
                }

              }

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