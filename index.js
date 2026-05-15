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

  findByFFNumber

} = require('./flightParser');

const {

  findPDByFFNumber

} = require('./pdParser');

const {

  startCache,

  getCacheStatus

} = require('./cache');

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
// Login Discord Bot
// ===============================
client.login(
  process.env.BOT_TOKEN
);

// ===============================
// Start Cache System
// ===============================
startCache();

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

    let pax = null;

    // ===========================
    // BN Search
    // Example:
    // 019
    // ===========================
    if (/^\d{1,3}$/.test(q)) {

      const bn =
        q.padStart(3, '0');

      pax =
        passengers[bn];
    }

    // ===========================
    // Seat Search
    // Example:
    // 12H
    // ===========================
    else if (/^\d+[A-Z]$/.test(q)) {

      pax =
        findBySeat(q);
    }

    // ===========================
    // FF Search
    // Example:
    // MU650278486253
    // MU 650278486253
    // ===========================
    else if (

      /^([A-Z]{2})\s?\d{6,}$/.test(q)

    ) {

      // =======================
      // FB Search
      // =======================
      pax =
        findByFFNumber(q);

      // =======================
      // PD Search
      // =======================
      if (!pax) {

        pax =
          findPDByFFNumber(q);

        if (pax) {

          pax.pdOnly = true;
        }
      }
    }

    // ===========================
    // Name Search
    // ===========================
    else {

      pax =
        findByName(q);
    }

    // ===========================
    // Passenger Not Found
    // ===========================
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
// Cache Status API
// ===============================
app.get('/status', (req, res) => {

  res.json(
    getCacheStatus()
  );

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
// Health Check
// ===============================
app.get('/', (req, res) => {

  res.send(
    'MU Lounge Validation Running'
  );

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