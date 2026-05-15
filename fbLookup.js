const {

  passengers,

  findBySeat,

  findByName,

  findByFFNumber,

  parseIncrementalLog

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
function getMembershipStatus(tier) {

  if (tier === 'V') {
    return 'Platinum';
  }

  if (tier === 'G') {
    return 'Gold';
  }

  if (tier === 'S') {
    return 'Silver';
  }

  return '';
}

// ===============================
// FB Lookup Command
// ===============================
module.exports = (client) => {

  client.on(
    'messageCreate',

    async (message) => {

      // Ignore Bots
      if (message.author.bot) {
        return;
      }

      const content =
        message.content
          .trim();

      // =========================
      // FB Commands
      // =========================
      if (

        !content
          .toUpperCase()
          .startsWith('FB ')

      ) {

        return;
      }

      const query =
        content
          .substring(3)
          .trim()
          .toUpperCase();

      if (!query) {

        await message.reply(
          'Usage: FB 152'
        );

        return;
      }

      try {

        // =====================
        // Download Latest Log
        // =====================
        const log =
          await getLatestFlightLog();

        if (!log) {

          await message.reply(
            'Unable to load Flight Control.log'
          );

          return;
        }

        // =====================
        // Parse Logs
        // =====================
        parseIncrementalLog(log);

        parsePDLog(log);

        let pax = null;

        // =====================
        // BN Search
        // =====================
        if (/^\d{1,3}$/.test(query)) {

          const bn =
            query.padStart(3, '0');

          pax =
            passengers[bn];
        }

        // =====================
        // Seat Search
        // =====================
        else if (
          /^\d+[A-Z]$/.test(query)
        ) {

          pax =
            findBySeat(query);
        }

        // =====================
        // Membership Search
        // =====================
        else if (
          /^[A-Z]{2}\d+$/.test(query)
        ) {

          pax =
            findByFFNumber(query);

          // PD fallback
          if (!pax) {

            pax =
              findPDByFFNumber(
                query
              );
          }
        }

        // =====================
        // Name Search
        // =====================
        else {

          pax =
            findByName(query);
        }

        // =====================
        // Not Found
        // =====================
        if (!pax) {

          await message.reply(
            'Passenger not found.'
          );

          return;
        }

        // =====================
        // Membership Status
        // =====================
        const membershipStatus =

          pax.membershipStatus ||

          getMembershipStatus(
            pax.ffTier
          );

        // =====================
        // Embed
        // =====================
        const embed = {

          color: 0xf59e0b,

          title:
            `${pax.flight}/${pax.flightDate}`,

          description:

            `👤 ${pax.name}\n\n` +

            `🎫 BN${pax.bn} | ${pax.seat} | ${pax.cabin} Class`,

          fields: [

            ...(pax.ffNumber

              ? [

                  {

                    name:
                      '💳 Membership',

                    value:

                      `${pax.ffCarrier} ${pax.ffNumber}` +

                      (
                        membershipStatus
                          ? `\n${membershipStatus}`
                          : ''
                      ),

                    inline: true
                  }

                ]

              : []),

            ...(pax.ticketNumber

              ? [

                  {

                    name:
                      '🎟 Ticket',

                    value:
                      pax.ticketNumber,

                    inline: true
                  }

                ]

              : []),

            ...(pax.bagtags?.length

              ? [

                  {

                    name:
                      '🧳 Bags',

                    value:

                      pax.bagtags.join('\n'),

                    inline: false
                  }

                ]

              : []),

            ...(pax.inbound

              ? [

                  {

                    name:
                      '⬅ Inbound',

                    value:

                      `${pax.inbound.flight}/${pax.inbound.date}\nFrom ${pax.inbound.origin}`,

                    inline: true
                  }

                ]

              : []),

            ...(pax.outbound

              ? [

                  {

                    name:
                      '➡ Outbound',

                    value:

                      `${pax.outbound.flight}/${pax.outbound.date}` +

                      (pax.outbound.bn
                        ? ` • BN${pax.outbound.bn}`
                        : '') +

                      (pax.outbound.seat
                        ? ` • ${pax.outbound.seat}`
                        : '') +

                      `\nTo ${pax.outbound.destination}`,

                    inline: true
                  }

                ]

              : []),

            ...(pax.specialServices?.length

              ? [

                  {

                    name:
                      '⚠ Special Service',

                    value:

                      pax.specialServices.join('\n'),

                    inline: false
                  }

                ]

              : []),

            {

              name:
                '🛋 Lounge Access',

              value:

                pax.lounge?.eligible

                  ? '✅ Eligible'

                  : '❌ Not Eligible',

              inline: true
            },

            {

              name:
                '👥 Lounge Guest',

              value:

                pax.lounge?.guest

                  ? '✅ Allowed'

                  : '❌ Not Allowed',

              inline: true
            }
          ],

          footer: {

            text:
              'MU Lounge Validation'
          }
        };

        // =====================
        // Send Embed
        // =====================
        await message.reply({

          embeds: [embed]
        });

      } catch (err) {

        console.error(err);

        await message.reply(
          'Lookup failed.'
        );
      }
    }
  );
};