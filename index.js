require('dotenv').config();

const express = require('express');
const { passengers, parseIncrementalLog, findBySeat, findByName, findByFFNumber } = require('./flightParser');
const { parsePDLog, findPDByFFNumber } = require('./pdParser');
const { getLatestFlightLog, getFlightLogByDate } = require('./googleDrive');
const { Client, GatewayIntentBits } = require('discord.js');
const fbLookup = require('./fbLookup');

// ===============================
// Express
// ===============================
const app = express();
app.use(express.json());
app.use(express.static('public'));

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
// FB Lookup
// ===============================
fbLookup(client);

// ===============================
// Discord Login
// ===============================
client.login(process.env.DISCORD_TOKEN);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===============================
// Search API
// ===============================
app.get('/search', async (req, res) => {
  try {
    let q = (req.query.q || '').trim().toUpperCase();
    if (!q) return res.json({ error: 'Missing query' });

    let date = null;

    // ===========================
    // 判断历史搜索格式: BN/DATE 或 Ticket/DATE 或 FF/DATE
    // ===========================
    const matchDate = q.match(/^(.+?)\/(\d{1,2}[A-Z]{3}\d{0,2})$/i);
    if (matchDate) {
      q = matchDate[1].trim();
      date = matchDate[2].trim().toUpperCase();
    }

    // ===========================
    // Load Flight Log: today or archive
    // ===========================
    let log = null;
    if (date) log = await getFlightLogByDate(date);
    else log = await getLatestFlightLog();

    if (!log) return res.json({ error: 'Unable to load Flight Control.log' });

    // ===========================
    // Parse logs
    // ===========================
    parseIncrementalLog(log);
    parsePDLog(log);

    let pax = null;

    // ===========================
    // BN search
    // ===========================
    if (/^\d{1,3}$/.test(q)) {
      const bn = q.padStart(3, '0');
      pax = passengers[bn];
    }
    // ===========================
    // Ticket search
    // ===========================
    else if (/^\d{13}$/.test(q)) {
      pax = Object.values(passengers).find(p => p.ticketNumber === q);
    }
    // ===========================
    // Seat search
    // ===========================
    else if (/^\d+[A-Z]$/i.test(q)) {
      pax = findBySeat(q);
    }
    // ===========================
    // FF Number search
    // ===========================
    else if (/^[A-Z]{2}\d+$/i.test(q)) {
      pax = findByFFNumber(q);
      if (!pax) pax = findPDByFFNumber(q);
    }
    // ===========================
    // Name search
    // ===========================
    else {
      pax = findByName(q);
    }

    if (!pax) return res.json({ error: 'Passenger not found' });

    // ===========================
    // Membership Status
    // ===========================
    let membershipStatus = '';
    if (pax.ffTier === 'V') membershipStatus = 'Platinum';
    else if (pax.ffTier === 'G') membershipStatus = 'Gold';
    else if (pax.ffTier === 'S') membershipStatus = 'Silver';

    // ===========================
    // Response JSON
    // ===========================
    res.json({
      ...pax,
      membershipStatus,
      flightDate: pax.flightDate || date || null
    });

  } catch (err) {
    console.error(err);
    res.json({ error: 'Search failed' });
  }
});

// ===============================
// Start Server
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});