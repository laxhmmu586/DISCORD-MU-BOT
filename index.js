require('dotenv').config();

const express = require('express');

const {
  Client,
  GatewayIntentBits
} = require('discord.js');

const {

  passengers,

  findBySeat,

  findByName,

  parseIncrementalLog

} = require('./flightParser');

const {

  getLatestFlightLog

} = require('./googleDrive');

const app = express();

// ===============================
// Static Website
// ===============================
app.use(
  express.static('public')
);

app.use(express.json({
  limit: '50mb'
}));

// ===============================
// Discord Client
// ===============================
const client = new Client({

  intents: [

    GatewayIntentBits.Guilds,

    GatewayIntentBits.GuildMessages,

    GatewayIntentBits.MessageContent

  ]

});

// ===============================
// Bot Ready
// ===============================
client.once('clientReady', () => {

  console.log(
    'Logged in as ' +
    client.user.tag
  );

});

// ===============================
// Load fbLookup
// ===============================
console.log(
  'Loading fbLookup.js'
);

require('./fbLookup')(client);

console.log(
  'fbLookup.js loaded'
);

// ===============================
// Login
// ===============================
client.login(
  process.env.BOT_TOKEN
);

// ===============================
// Search API
// ===============================
app.get('/search', async (req, res) => {

  try {

    const q =
      String(
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

    // ===========================
    // Load latest log
    // ===========================
    const log =
      await getLatestFlightLog();

    if (!log) {

      return res.json({

        error:
          'Unable to load log'
      });
    }

    // ===========================
    // Parse latest log
    // ===========================
    parseIncrementalLog(log);

    let pax = null;

    // ===========================
    // BN Search
    // ===========================
    if (/^\d{1,3}$/.test(q)) {

      const bn =
        q.padStart(3, '0');

      pax =
        passengers[bn];
    }

    // ===========================
    // Seat Search
    // ===========================
    else if (/^\d+[A-Z]$/.test(q)) {

      pax =
        findBySeat(q);
    }

    // ===========================
    // Name Search
    // ===========================
    else {

      pax =
        findByName(q);
    }

    if (!pax) {

      return res.json({

        error:
          'Passenger not found'
      });
    }

    // ===========================
    // Response
    // ===========================
    res.json(pax);

  } catch (err) {

    console.error(err);

    res.json({

      error:
        err.toString()
    });
  }
});

// ===============================
// Send Discord Message API
// ===============================
app.post('/send', async (req, res) => {

  try {

    const {
      message,
      channelId,
      embeds
    } = req.body;

    // Validation
    if (!channelId) {

      return res
        .status(400)
        .send(
          'Missing channelId'
        );
    }

    // Fetch Channel
    const channel =
      await client.channels.fetch(
        channelId
      );

    if (!channel) {

      return res
        .status(404)
        .send(
          'Channel not found'
        );
    }

    // Send Message
    await channel.send({

      content:
        message || '',

      embeds:
        embeds || []

    });

    console.log(
      'Sent to channel: ' +
      channelId
    );

    res.send('OK');

  } catch (err) {

    console.error(err);

    res
      .status(500)
      .send(
        err.toString()
      );
  }

});

// ===============================
// Railway Port
// ===============================
const PORT =
  process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {

  console.log(
    'Server started on port ' +
    PORT
  );

});