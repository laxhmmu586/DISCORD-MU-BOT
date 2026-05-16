require('dotenv').config();

const express = require('express');

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

  getLatestFlightLog,

  getFlightLogByDate

} = require('./googleDrive');

const {

  Client,

  GatewayIntentBits

} = require('discord.js');

const fbLookup =
  require('./fbLookup');

function findPassengerByFFFromRecord(log, query) {
  const ff = query.replace(/\s+/g, '').toUpperCase();
  const sections =
    log.split(/\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g);

  for (const section of sections) {

    const ffMatch =
      section.match(/FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/i);

    if (!ffMatch) continue;

    const currentFF =
      `${ffMatch[1]}${ffMatch[2]}`
        .replace(/\s+/g, '')
        .toUpperCase();

    if (currentFF !== ff) continue;

    const paxMatch =
      section.match(/\n\s*\d+\.\s+\d?([A-Z\/]+\+?)\s+(?:N\d\s+)?(?:BN(\d{1,3}))?\s*(\d+[A-Z])?/i);

    const prMatch =
      section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);

    return {
      bn: (paxMatch?.[2] || '---').padStart(3, '0'),
      name: (paxMatch?.[1] || 'UNKNOWN').replace(/\+$/, ''),
      seat: paxMatch?.[3] || '---',
      cabin: /^\d+/.test(paxMatch?.[3] || '') ? 'Economy' : 'Economy',
      flight: prMatch?.[1] || '',
      flightDate: (prMatch?.[2] || '').substring(0, 5),
      ffCarrier: ffMatch[1],
      ffNumber: ffMatch[2],
      ffTier: ffMatch[3],
      lounge: {
        eligible: true,
        guest: ffMatch[3] === 'V'
      }
    };
  }

  return null;
}

// ===============================
// Express
// ===============================
const app =
  express();

app.use(
  express.json()
);

app.use(
  express.static('public')
);

// ===============================
// Discord Client
// ===============================
const client =
  new Client({

    intents: [

      GatewayIntentBits.Guilds,

      GatewayIntentBits.GuildMessages,

      GatewayIntentBits.MessageContent
    ]
  });

// ===============================
// FB Lookup
// ===============================
fbLookup(client);

// ===============================
// Discord Login
// ===============================
client.login(
  process.env.DISCORD_TOKEN
);

client.once(

  'ready',

  () => {

    console.log(
      `Logged in as ${client.user.tag}`
    );
  }
);

// ===============================
// Search API
// ===============================
app.get(

  '/search',

  async (req, res) => {

    try {

      let q =
        (
          req.query.q || ''
        )
        .trim()
        .toUpperCase();

      if (!q) {

        return res.json({

          error:
            'Missing query'
        });
      }

      // =========================
      // Date Search
      // Example:
      // 230/20APR
      // 7812545625555/20APR
      // MU5656565/20APR
      // 32A/20APR
      // =========================
      let date = null;

      if (q.includes('/')) {

        const parts =
          q.split('/');

        if (parts.length === 2) {

          q =
            parts[0]
              .trim()
              .toUpperCase();

          date =
            parts[1]
              .trim()
              .toUpperCase();
        }
      }

      // =========================
      // Load Log
      // =========================
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

        return res.json({

          error:
            'Unable to load logs (Flight Control.log / Lake.log / Ticketing.log)'
        });
      }

      // =========================
      // Parse
      // =========================
      parseIncrementalLog(log);

      parsePDLog(log);

      let pax = null;

      // =========================
      // BN Search
      // =========================
      if (
        /^\d{1,3}$/.test(q)
      ) {

        const bn =
          q.padStart(3, '0');

        pax =
          passengers[bn];
      }

      // =========================
      // Ticket Search
      // =========================
      else if (
        /^\d{13}$/.test(q)
      ) {

        pax =
          Object.values(passengers)
            .find(p => {

              return (
                p.ticketNumber === q
              );
            });
      }

      // =========================
      // Seat Search
      // =========================
      else if (
        /^\d+[A-Z]$/i.test(q)
      ) {

        pax =
          findBySeat(q);
      }

      // =========================
      // FF Search
      // =========================
      else if (

        /^[A-Z]{2}\d+$/i
          .test(q)

      ) {

        pax =
          findByFFNumber(q);

        // PD fallback
        if (!pax) {

          pax =
            findPDByFFNumber(q);
        }

        // record fallback
        if (!pax) {
          pax =
            findPassengerByFFFromRecord(
              log,
              normalizedFF
            );
        }
      }

      // =========================
      // Name Search
      // =========================
      else {

        pax =
          findByName(q);
      }

      // =========================
      // Not Found
      // =========================
      if (!pax) {

        return res.json({

          error:
            'Passenger not found'
        });
      }

      // =========================
      // Membership Status
      // =========================
      let membershipStatus = '';

      if (pax.ffTier === 'V') {

        membershipStatus =
          'Platinum';
      }

      else if (
        pax.ffTier === 'G'
      ) {

        membershipStatus =
          'Gold';
      }

      else if (
        pax.ffTier === 'S'
      ) {

        membershipStatus =
          'Silver';
      }

      // =========================
      // Response
      // =========================
      res.json({

        ...pax,

        membershipStatus
      });

    }

    catch (err) {

      console.error(err);

      res.json({

        error:
          'Search failed'
      });
    }
  }
);

// ===============================
// Send Message API
// ===============================
app.post('/send', async (req, res) => {

  try {

    const {
      channelId,
      message
    } = req.body;

    if (!channelId) {

      return res.json({
        error: 'Missing channelId'
      });
    }

    const channel =
      await client.channels.fetch(channelId);

    if (!channel) {

      return res.json({
        error: 'Channel not found'
      });
    }

    if (req.body.embeds) {

  await channel.send({
    content: message || "",
    embeds: req.body.embeds
  });

} else {

  await channel.send(message);
}

    res.json({
      success: true
    });

  }

  catch (err) {

    console.error(err);

    res.json({
      error: 'Send failed'
    });
  }
});
// ===============================
// Start Server
// ===============================
const PORT =
  process.env.PORT || 3000;

app.listen(

  PORT,

  () => {

    console.log(
      `Server running on ${PORT}`
    );
  }
);
