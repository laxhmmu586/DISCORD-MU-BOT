require('dotenv').config();

const express = require('express');

const {
  Client,
  GatewayIntentBits
} = require('discord.js');

const app = express();

app.use(express.json({ limit: '50mb' }));

// ===============================
// Discord Client
// ===============================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===============================
// Bot Ready
// ===============================

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===============================
// Login
// ===============================

client.login(process.env.BOT_TOKEN);

// ===============================
// Health Check
// ===============================

app.get('/', (req, res) => {
  res.send('Discord Bot Running');
});

// ===============================
// Send Message API
// ===============================

app.post('/send', async (req, res) => {

  try {

    const {
      message,
      channelId
    } = req.body;

    // Validate
    if (!message) {
      return res.status(400).send('Missing message');
    }

    if (!channelId) {
      return res.status(400).send('Missing channelId');
    }

    // Fetch Channel
    const channel = await client.channels.fetch(channelId);

    if (!channel) {
      return res.status(404).send('Channel not found');
    }

    // Send Message
    await channel.send(message);

    console.log(`Message sent to ${channelId}`);

    res.send('OK');

  } catch (err) {

    console.error(err);

    res.status(500).send(err.toString());

  }

});

// ===============================
// Railway Port
// ===============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});