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

  return 'Regular';
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
        // Build Message
        // =====================
        const lines = [

          `${pax.flight}/${pax.flightDate}`,

          '',

          pax.name,

          '',

          `BN${pax.bn} | ${pax.seat} | ${pax.cabin} Class`,

          '',

          'Membership',

          `${pax.ffCarrier || 'NONE'} ${pax.ffNumber || ''}`,

          membershipStatus,

          ...(pax.ticketNumber

            ? [

                '',

                'Ticket',

                pax.ticketNumber
              ]

            : []),

          ...(pax.bagtags?.length

            ? [

                '',

                'Bags',

                pax.bagtags.join('\n')
              ]

            : []),

          ...(pax.specialServices?.length

            ? [

                '',

                'Special Service',

                pax.specialServices.join(
                  '\n'
                )

              ]

            : []),

          '',

          'Lounge Entitle',

          pax.lounge?.eligible

            ? '✅ Eligible'

            : '❌ Not Eligible',

          '',

          'Lounge Guest',

          pax.lounge?.guest

            ? '✅ Allowed'

            : '❌ Not Allowed'
        ];

        // =====================
        // Send Reply
        // =====================
        await message.reply(

          lines.join('\n')
        );

      } catch (err) {

        console.error(err);

        await message.reply(
          'Lookup failed.'
        );
      }
    }
  );
};