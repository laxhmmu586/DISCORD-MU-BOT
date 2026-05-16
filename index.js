// index.js
const express = require('express');
const {
  passengers,
  parseIncrementalLog,
  findBySeat,
  findByName,
  findByFFNumber,
  clearPassengers
} = require('./flightParser');

const {
  parsePDLog,
  findPDByFFNumber,
  clearPD
} = require('./pdParser');

const {
  getLatestFlightLog,
  getFlightLogByDate
} = require('./googleDrive');

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
// Discord Login using environment variable
// ===============================
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('ERROR: DISCORD_TOKEN environment variable not set.');
  process.exit(1);
}

client.login(token);

client.once('clientReady', () => {
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

    // 判断是否包含日期 (e.g., 174/11APR or 7817428774392/20APR)
    const matchDate = q.match(/^(.+?)\/(\d{1,2}[A-Z]{3}\d{0,4})$/i);
    if (matchDate) {
      q = matchDate[1].trim();
      date = matchDate[2].trim().toUpperCase();
    }

    // =========================
    // Load Flight Log: today or archive
    // =========================
    let log = null;
    if (date) log = await getFlightLogByDate(date);  // archive search
    else log = await getLatestFlightLog();           // today search

    if (!log) return res.json({ error: 'Unable to load Flight Control.log' });

    // =========================
    // Clear previous cache
    // =========================
    clearPassengers();
    clearPD();

    // =========================
    // Parse logs
    // =========================
    parseIncrementalLog(log);
    parsePDLog(log);

    let pax = null;

    // =========================
    // BN search
    // =========================
    if (/^\d{1,3}$/.test(q)) {
      const bn = q.padStart(3, '0');
      pax = passengers[bn];
    }
    // =========================
    // Ticket search
    // =========================
    else if (/^\d{13}$/.test(q)) {
      pax = Object.values(passengers).find(p => p.ticketNumber === q);
    }
    // =========================
    // Seat search
    // =========================
    else if (/^\d+[A-Z]$/i.test(q)) {
      pax = findBySeat(q);
    }
    // =========================
    // FF Number search
    // =========================
    else if (/^[A-Z]{2}\d+$/i.test(q)) {
      pax = findByFFNumber(q);
      if (!pax && date) pax = findPDByFFNumber(q); // only check PD for FF in history
    }
    // =========================
    // Name search (only today)
    // =========================
    else if (!date) {
      pax = findByName(q);
    }

    if (!pax) return res.json({ error: 'Passenger not found' });

    // =========================
    // Membership Status
    // =========================
    let membershipStatus = '';
    if (pax.ffTier === 'V') membershipStatus = 'Platinum';
    else if (pax.ffTier === 'G') membershipStatus = 'Gold';
    else if (pax.ffTier === 'S') membershipStatus = 'Silver';
    else if (pax.membershipNumber) {
      // FF/DL 9136666626/D/*2
      const tierMatch = pax.membershipNumber.match(/\/([A-Z])\/\*?(\d)/i);
      if (tierMatch) {
        const letter = tierMatch[1].toUpperCase();
        const num = tierMatch[2];
        if (num === '1') membershipStatus = 'Elite';
        else if (num === '2') membershipStatus = 'Elite Plus';
        else if (letter === 'D') membershipStatus = 'Diamond';
        else if (letter === 'C') membershipStatus = 'Regular';
      }
    }

    // =========================
    // Response JSON
    // =========================
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