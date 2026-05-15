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
      // 174/11MAY
      // =========================
      let date = null;

      if (q.includes('/')) {

        const parts =
          q.split('/');

        // Avoid names
        if (

          parts.length === 2 &&

          /^\d{1,3}$/.test(parts[0])

        ) {

          q =
            parts[0]
              .trim();

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
            'Unable to load Flight Control.log'
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