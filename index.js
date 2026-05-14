require('dotenv').config();

const fs = require('fs');

const express = require('express');

const {
  Client,
  GatewayIntentBits
} = require('discord.js');

const {
  parseIncrementalLog
} = require('./flightParser');

const app = express();

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

client.once('ready', () => {

  console.log(
    'Logged in as ' +
    client.user.tag
  );

  // ===========================
  // Load Flight Control Log
  // ===========================
  try {

    const data =
      fs.readFileSync(
        './Flight Control.log',
        'utf8'
      );

    parseIncrementalLog(data);

    console.log(
      'Flight control log loaded'
    );

  } catch (err) {

    console.error(
      'Failed to load Flight Control.log'
    );

    console.error(err);
  }

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
// Health Check
// ===============================

app.get('/', (req, res) => {

  res.send(
    'Discord Bot Running'
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
// Flight Log API
// ===============================

app.post('/flight-log', async (req, res) => {

  try {

    const {
      log
    } = req.body;

    if (!log) {

      return res
        .status(400)
        .send(
          'Missing log'
        );

    }

    parseIncrementalLog(log);

    console.log(
      'Flight log updated'
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