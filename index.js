require('dotenv').config();

const express = require('express');

const {
  Client,
  GatewayIntentBits
} = require('discord.js');

const app = express();

app.use(express.json());

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.BOT_TOKEN);

app.post('/send', async (req, res) => {

  try {

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    await channel.send(req.body.message);

    res.send('OK');

  } catch (err) {

    console.error(err);

    res.status(500).send(err.toString());

  }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Server started');
});