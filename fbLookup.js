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

  getLatestFlightLog,

  getFlightLogByDate

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

      const upper =
        content.toUpperCase();

      let query = '';
      let mode = '';

      // =========================
      // FB 174
      // =========================
      if (upper.startsWith('FB ')) {

        mode = 'BN';

        query =
          content
            .substring(3)
            .trim();
      }

      // =========================
      // RN NAME
      // =========================
      else if (upper.startsWith('RN ')) {

        mode = 'NAME';

        query =
          content
            .substring(3)
            .trim();
      }

      // =========================
      // FSN SEAT
      // =========================
      else if (upper.startsWith('FSN ')) {

        mode = 'SEAT';

        query =
          content
            .substring(4)
            .trim();
      }

      // =========================
      // ETKD TICKET
      // =========================
      else if (upper.startsWith('ETKD ')) {

        mode = 'TICKET';

        query =
          content
            .substring(5)
            .trim();
      }

      // =========================
      // FF NUMBER
      // =========================
      else if (upper.startsWith('FF ')) {

        mode = 'FF';

        query =
          content
            .substring(3)
            .trim();
      }

      // =========================
      // Invalid
      // =========================
      else {

        return;
      }

      query =
        query.toUpperCase();

      // =========================
      // Date Search
      // Example:
      // FB 174/11MAY
      // =========================
      let date = null;

      if (query.includes('/')) {

        const parts =
          query.split('/');

        if (

          parts.length === 2 &&

          mode === 'BN'

        ) {

          query =
            parts[0]
              .trim();

          date =
            parts[1]
              .trim()
              .toUpperCase();
        }
      }

      try {

        // =====================
        // Load Log
        // =====================
        let log = null;

        // Archive
        if (date) {

          log =
            await getFlightLogByDate(
              date
            );
        }

        // Today
        else {

          log =
            await getLatestFlightLog();
        }

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
        if (mode === 'BN') {

          const bn =
            query.padStart(3, '0');

          pax =
            passengers[bn];
        }

        // =====================
        // Seat Search
        // =====================
        else if (mode === 'SEAT') {

          pax =
            findBySeat(query);
        }

        // =====================
        // Ticket Search
        // =====================
        else if (mode === 'TICKET') {

          pax =
            Object.values(passengers)
              .find(p => {

                return (
                  p.ticketNumber === query
                );
              });
        }

        // =====================
        // FF Search
        // =====================
        else if (mode === 'FF') {

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
        else if (mode === 'NAME') {

          pax =
            findByName(query);
        }

        // =====================
        // Not Found
        // =====================
        if (!pax) {

          await message.reply(
            'Passenger data not updated yet.'
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
            `✈️ ${pax.flight}/${pax.flightDate}`,

          description:

            `👤 ${pax.name}\n\n` +

            `🎫 BN${pax.bn} • ${pax.seat} • ${pax.cabin}`,

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
              'MUL system'
          }
        };

        // =====================
        // Send Embed
        // =====================
        await message.reply({

          embeds: [embed]
        });

      }

      catch (err) {

        console.error(err);

        await message.reply(
          'Lookup failed.'
        );
      }
    }
  );
};