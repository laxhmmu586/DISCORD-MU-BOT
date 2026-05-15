const {

  passengers,

  findBySeat,

  findByName,

  findByFFNumber

} = require('./flightParser');

const {

  findPDByFFNumber

} = require('./pdParser');

// ===============================
// FF Status
// ===============================
function getFFStatus(pax) {

  if (!pax.ffTier) {
    return 'NONE';
  }

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
// FB Embed
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
`${pax.name}

BN${pax.bn} | ${pax.seat} | ${pax.cabin} Class`,

    fields: [

      {

        name:
          '💳 Membership',

        value:
`${pax.ffCarrier || 'NONE'} ${pax.ffNumber || ''}

${getFFStatus(pax)}`,

        inline:
          false
      },

      {

        name:
          '🎟 Ticket',

        value:
          pax.ticketNumber || 'NONE',

        inline:
          false
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
        'China Eastern Flight Control'
    }
  };
}

// ===============================
// PD Embed
// ===============================
function createPDEmbed(pax) {

  if (!pax) {

    return {

      title:
        'Passenger Not Found',

      description:
        'No matching PD passenger found.',

      color:
        0xff0000
    };
  }

  let tier =
    pax.ffTier || 'NONE';

  if (tier === 'V') {
    tier = 'Platinum';
  }

  else if (tier === 'G') {
    tier = 'Gold';
  }

  else if (tier === 'S') {
    tier = 'Silver';
  }

  else if (tier === 'C') {
    tier = 'Regular';
  }

  return {

    color:
      pax.lounge?.eligible
        ? 0x00cc99
        : 0xff9900,

    title:
      `${pax.flight || 'MU586'}/${pax.flightDate || 'UNKNOWN'}`,

    description:
`${pax.name || 'UNKNOWN'}

BN${pax.bn || '---'} | ${pax.seat || '---'} | ${pax.cabin || 'Unknown'} Class`,

    fields: [

      {

        name:
          '💳 Membership',

        value:
`${pax.ffCarrier || 'NONE'} ${pax.ffNumber || 'NONE'}

${tier}`,

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
        // FB QUERY
        // Example:
        // FB 123
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
        // Example:
        // FSN 20A
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
        // Example:
        // RN HUANG
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
        // FF QUERY
        // Example:
        // FF MU650278486253
        // FF MU 650278486253
        // ===========================
        if (
          text.startsWith('FF')
        ) {

          const ff =
            text
              .replace('FF', '')
              .trim();

          // =======================
          // FB Search
          // =======================
          let pax =
            findByFFNumber(ff);

          // =======================
          // PD Search
          // =======================
          if (!pax) {

            pax =
              findPDByFFNumber(ff);
          }

          // =======================
          // PD Passenger
          // =======================
          if (
            pax &&
            !pax.ticketNumber
          ) {

            return message.reply({

              embeds: [

                createPDEmbed(pax)

              ]

            });
          }

          // =======================
          // Normal FB Passenger
          // =======================
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

          const silver =
            paxList.filter(
              p => p.ffTier === 'S'
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

                    name:
                      '👥 Total',

                    value:
                      String(total),

                    inline:
                      true
                  },

                  {

                    name:
                      '🛋 Lounge',

                    value:
                      String(lounge),

                    inline:
                      true
                  },

                  {

                    name:
                      '💎 Platinum',

                    value:
                      String(platinum),

                    inline:
                      true
                  },

                  {

                    name:
                      '🥇 Gold',

                    value:
                      String(gold),

                    inline:
                      true
                  },

                  {

                    name:
                      '🥈 Silver',

                    value:
                      String(silver),

                    inline:
                      true
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