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
// Fallback Search by PR Record
// ===============================
function findPassengerFromPRRecord(log, mode, query) {

  const sections =
    log.split(
      /\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g
    );

  const normalizedBN =
    query.padStart(3, '0');

  const normalizedSeat =
    query.toUpperCase();

  const targetSection =
    sections.find(section => {

      const prLine =
        section.match(/PR:\s+[^\n\r]+/i)?.[0] || '';

      if (mode === 'BN') {
        return new RegExp(
          `,BN0*${normalizedBN}\\b`,
          'i'
        ).test(prLine);
      }

      if (mode === 'SEAT') {
        return new RegExp(
          `,SN\\s*${normalizedSeat}\\b`,
          'i'
        ).test(prLine);
      }

      return false;
    });

  if (!targetSection) {
    return null;
  }

  const bnMatch =
    targetSection.match(/\bBN(\d{1,3})\b/i);

  const pax =
    targetSection.match(
      /\d+\.\s+([A-Z\/]+).*?BN(\d{1,3}).*?(\d+[A-Z])?/i
    );

  const flightMatch =
    targetSection.match(
      /PR:\s+([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i
    );

  if (!bnMatch && !pax) {
    return null;
  }

  return {
    bn:
      (pax?.[2] || bnMatch?.[1] || '')
        .padStart(3, '0'),
    name:
      pax?.[1] || 'UNKNOWN',
    seat:
      pax?.[3] || '---',
    cabin: 'Economy',
    flight:
      flightMatch?.[1] || '',
    flightDate:
      (flightMatch?.[2] || '').substring(0, 5),
    membershipStatus: ''
  };
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
      // FB 174/20APR
      // ETKD 7812.../20APR
      // FF MU.../20APR
      // FSN 32A/20APR
      // =========================
      let date = null;

      if (query.includes('/')) {

        const parts =
          query.split('/');

        if (parts.length === 2) {

          query =
            parts[0]
              .trim()
              .toUpperCase();

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

          if (!pax) {
            pax =
              findPassengerFromPRRecord(
                log,
                mode,
                query
              );
          }
        }

        // =====================
        // Seat Search
        // =====================
        else if (mode === 'SEAT') {

          pax =
            findBySeat(query);

          if (!pax) {
            pax =
              findPassengerFromPRRecord(
                log,
                mode,
                query
              );
          }
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
              'MUFTF system'
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
