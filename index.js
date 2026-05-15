```js id="n5x7pk"
require('dotenv').config();

const express = require('express');
const path = require('path');

const {
  Client,
  GatewayIntentBits
} = require('discord.js');

const app = express();

// ===============================
// Static Website
// ===============================
app.use(
  express.static(
    path.join(__dirname, 'public')
  )
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
// Homepage
// ===============================
app.get('/', (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );

});

// ===============================
// Lounge Lookup API
// ===============================
app.get('/lookup', async (req, res) => {

  try {

    const q =
      (req.query.q || '')
      .trim()
      .toUpperCase();

    // ===============================
    // DEMO DATA
    // Replace with Google Sheet later
    // ===============================
    const records = [

      {

        fb: 'FB008',

        rn: 'RN008',

        ticket: '7819496979113',

        name: 'HUANG/ZEYUANMR',

        bn: 'BN008',

        seat: '32K',

        ffNumber: 'MU 610264716710',

        tier: 'Regular / C',

        guestAllowed: false

      },

      {

        fb: 'FB009',

        rn: 'RN009',

        ticket: '7811234567890',

        name: 'ZHANG/SANMR',

        bn: 'BN009',

        seat: '12A',

        ffNumber: 'MU 610000000001',

        tier: 'Silver / E',

        guestAllowed: true

      }

    ];

    // ===============================
    // Search Logic
    // ===============================
    let result = null;

    // FB
    if (q.startsWith('FB')) {

      result = records.find(
        r => r.fb === q
      );

    }

    // RN
    else if (q.startsWith('RN')) {

      result = records.find(
        r => r.rn === q
      );

    }

    // Ticket
    else if (q.startsWith('781')) {

      result = records.find(
        r => r.ticket === q
      );

    }

    // BN
    else if (q.startsWith('BN')) {

      result = records.find(
        r => r.bn === q
      );

    }

    // Not Found
    if (!result) {

      return res.json({
        error: true
      });

    }

    // Return Result
    res.json(result);

  } catch (err) {

    console.error(err);

    res.status(500).json({

      error: true,

      message: err.toString()

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
```
