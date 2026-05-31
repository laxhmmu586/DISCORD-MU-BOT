require('dotenv').config();

const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const {

  passengers,

  parseIncrementalLog,

  findBySeat,

  findByName,

  findByFFNumber,

  findByBagtag

} = require('./flightParser');

const {

  parsePDLog,

  findPDByFFNumber

} = require('./pdParser');

const {

  getLatestFlightLog,

  getFlightLogByDate,
  get240InfoByBnAndFlightDate,
  getSyBagInfoByDate,
  getSalesReportMeta,
  downloadSalesReportByFlight

} = require('./googleDrive');

const {

  Client,

  GatewayIntentBits

} = require('discord.js');

const fbLookup =
  require('./fbLookup');
const { findSYInfo } = require('./syParser');
const DEFAULT_PERMISSIONS = {
  canViewTravelDocs: true,
  canViewMembership: true,
  canViewTicket: true,
  canViewBags: true,
  canViewInbound: true,
  canViewOutbound: true,
  canViewCheckinDetails: true,
  canView240Info: true,
  canViewSpecialService: true,
  canViewSpecialMeals: true,
  canViewLoungeAccess: true,
  canViewGuestAccess: true,
  canViewPaidService: true
};

async function resolveAuthContextFromRequest(req) {
  return { permissions: { ...DEFAULT_PERMISSIONS }, uid: null, claims: {} };
}

function applyPermissionFilter(pax, permissions, info240) {
  const filtered = {
    ...pax,
    permissions
  };

  filtered.info240 = info240;

  return filtered;
}

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



function extractSeatAfterBnText(text) {
  return (String(text || '').match(/\bBN\s*\d{1,3}\b\s+\*?(\d{1,3}[A-Z])\b/i)?.[1] || '').toUpperCase();
}

function findPassengerFromPRRecord(log, mode, query) {
  const normalized = String(query || '').trim().toUpperCase();
  const normalizedBN = normalized.replace(/^0+/, '') || '0';

  const sections =
    log.split(/\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g);

  const targetSection = sections.find(section => {
    const prLine = section.split(/\r?\n/).find(line => line.includes('PR:')) || '';

    if (mode === 'BN') {
      return new RegExp(`,BN0*${normalizedBN}\\b`, 'i').test(prLine);
    }

    if (mode === 'SEAT') {
      return new RegExp(`\\b${normalized}\\b`, 'i').test(section);
    }

    return section.toUpperCase().includes(normalized);
  });

  if (!targetSection) return null;

  const bnMatch = targetSection.match(/\bBN(\d{1,3})\b/i);
  const passengerLine = targetSection.split(/\r?\n/).find(line => /^\s*\d+\.\s*/.test(line)) || '';
  const paxMatch =
    passengerLine.match(/^\s*\d+\.\s+\d?([A-Z\/]+\+?)/i) ||
    targetSection.match(/\d+\.\s+\d?([A-Z\/]+\+?)/i);
  const seatFromRecord =
    extractSeatAfterBnText(passengerLine) ||
    (targetSection.match(/\bSN\s*(\d{1,3}[A-Z])\b/i)?.[1] || '').toUpperCase();
  const prMatch = targetSection.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);

  return {
    bn: (bnMatch?.[1] || '---').padStart(3, '0'),
    name: (paxMatch?.[1] || 'UNKNOWN').replace(/\+$/, ''),
    seat: seatFromRecord || '---',
    cabin: 'Economy',
    flight: prMatch?.[1] || '',
    flightDate: (prMatch?.[2] || '').substring(0, 5),
    lounge: { eligible: false, guest: false }
  };
}

function findPDPassengerByFFFromLog(log, query) {
  const ff =
    query.replace(/\s+/g, '').toUpperCase();

  const sections =
    log.split(/\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g);

  for (const section of sections) {
    if (!section.includes('PD:')) continue;

    const rows =
      section.split(/\r?\n/);

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      const m =
        line.match(/FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/i);

      if (!m) continue;

      const current =
        `${m[1]}${m[2]}`
          .replace(/\s+/g, '')
          .toUpperCase();

      if (current !== ff) continue;

      let name = 'PD MEMBER';
      let bn = '---';
      let seat = '---';

      for (let j = i - 1; j >= 0; j--) {
        const pax =
          rows[j].match(/\s*\d+\.\s+\d?([A-Z\/]+\+?)\s+(?:\S+\s+)?(?:BN(\d{1,3}))?\s*(\d+[A-Z])?/i);

        if (pax) {
          name = pax[1]?.replace(/\+$/, '') || name;
          if (pax[2]) bn = pax[2].padStart(3, '0');
          if (pax[3]) seat = pax[3];
          break;
        }
      }

      const flightMatch =
        section.match(/PD:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);

      return {
        name,
        bn,
        seat,
        cabin: 'Elite',
        flight: flightMatch?.[1] || '',
        flightDate: (flightMatch?.[2] || '').substring(0, 5),
        ffCarrier: m[1],
        ffNumber: m[2],
        ffTier: m[3],
        membershipStatus: m[3] === 'V' ? 'Platinum' : m[3] === 'G' ? 'Gold' : m[3] === 'S' ? 'Silver' : '',
        lounge: {
          eligible: true,
          guest: m[3] === 'V'
        }
      };
    }
  }

  return null;
}

// ===============================
// Express
// ===============================
const app =
  express();

const allowedOrigins = [
  "https://china-eastern.web.app",
  "https://www.mufcapp.net",
  "https://mufcapp.net"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(
  express.json()
);

app.use(
  express.static('public')
);

const REVIEW_STORE_PATH = path.join(__dirname, 'securityReviews.json');
const REVIEW_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

function reviewCutoffIso() {
  return new Date(Date.now() - REVIEW_RETENTION_MS).toISOString();
}

function reviewFlightKey(flightNo, flightDate) {
  return `${String(flightNo || '').trim().toUpperCase()}/${String(flightDate || '').trim().toUpperCase()}`;
}

async function readReviewStore() {
  try {
    const raw = await fs.readFile(REVIEW_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { reviews: {} };
  } catch (err) {
    if (err?.code === 'ENOENT') return { reviews: {} };
    throw err;
  }
}

async function writeReviewStore(store) {
  await fs.writeFile(REVIEW_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
}

function pruneReviewStore(store) {
  const cutoff = reviewCutoffIso();
  const reviews = store.reviews && typeof store.reviews === 'object' ? store.reviews : {};
  Object.entries(reviews).forEach(([flightKey, rows]) => {
    if (!rows || typeof rows !== 'object') {
      delete reviews[flightKey];
      return;
    }
    Object.entries(rows).forEach(([bn, review]) => {
      if (!review?.updatedAt || review.updatedAt < cutoff) delete rows[bn];
    });
    if (!Object.keys(rows).length) delete reviews[flightKey];
  });
  store.reviews = reviews;
  return store;
}

function sanitizeReviewStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['pass', 'fail'].includes(normalized) ? normalized : '';
}

function sanitizeReviewComment(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 500);
}

function sanitizeReviewer(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 120);
}


const ALLOWED_ORIGINS = [
  'https://china-eastern.web.app',
  'https://china-eastern.firebaseapp.com',
  process.env.WEB_ORIGIN
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

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

  'clientReady',

  () => {

    console.log(
      `Logged in as ${client.user.tag}`
    );
  }
);


app.get('/security-reviews', async (req, res) => {
  try {
    const flightNo = String(req.query.flightNo || '').toUpperCase();
    const flightDate = String(req.query.flightDate || '').toUpperCase();
    if (!flightNo || !flightDate) return res.status(400).json({ error: 'Missing flightNo or flightDate' });
    const store = pruneReviewStore(await readReviewStore());
    await writeReviewStore(store);
    const key = reviewFlightKey(flightNo, flightDate);
    return res.json({ reviews: store.reviews[key] || {} });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Security review lookup failed' });
  }
});

app.post('/security-reviews', async (req, res) => {
  try {
    const flightNo = String(req.body?.flightNo || '').toUpperCase();
    const flightDate = String(req.body?.flightDate || '').toUpperCase();
    const bn = String(req.body?.bn || '').replace(/\D/g, '').padStart(3, '0');
    const status = sanitizeReviewStatus(req.body?.status);
    const comment = sanitizeReviewComment(req.body?.comment);
    const reviewer = sanitizeReviewer(req.body?.reviewer);
    if (!flightNo || !flightDate || !/^\d{3}$/.test(bn) || !status) {
      return res.status(400).json({ error: 'Missing flightNo, flightDate, BN, or status' });
    }
    const store = pruneReviewStore(await readReviewStore());
    const key = reviewFlightKey(flightNo, flightDate);
    store.reviews[key] = store.reviews[key] || {};
    store.reviews[key][bn] = { status, comment, reviewer, updatedAt: new Date().toISOString() };
    await writeReviewStore(store);
    return res.json({ ok: true, review: store.reviews[key][bn] });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Security review save failed' });
  }
});

// ===============================
// Search API
// ===============================
app.get(
  '/sales-report/meta',
  async (req, res) => {
    try {
      const flightNo = String(req.query.flightNo || '').toUpperCase();
      const flightDate = String(req.query.flightDate || '').toUpperCase();
      if (!flightNo || !flightDate) {
        return res.status(400).json({ error: 'Missing flightNo or flightDate' });
      }
      const meta = await getSalesReportMeta(flightNo, flightDate);
      return res.json(meta);
    } catch (err) {
      return res.status(500).json({ error: err?.message || 'Sales report lookup failed' });
    }
  }
);

app.get(
  '/sales-report/download',
  async (req, res) => {
    try {
      const flightNo = String(req.query.flightNo || '').toUpperCase();
      const flightDate = String(req.query.flightDate || '').toUpperCase();
      if (!flightNo || !flightDate) {
        return res.status(400).json({ error: 'Missing flightNo or flightDate' });
      }
      const result = await downloadSalesReportByFlight(flightNo, flightDate);
      if (!result) return res.status(404).json({ error: 'Sales report not found' });
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      return res.send(Buffer.from(result.content));
    } catch (err) {
      return res.status(500).json({ error: err?.message || 'Sales report download failed' });
    }
  }
);

app.get(

  '/search',

  async (req, res) => {

    try {

      const rawQuery =
        String(req.query.q || '')
          .trim()
          .toUpperCase();

      let q = rawQuery;

      q =
        q.replace(
          /^FF(?:\/|\s+)/i,
          ''
        );

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
      let yearSuffix = null;

      const dateSuffixMatch =
        q.match(
          /^(.*)\/(\d{2}[A-Z]{3})(\d{2})?$/i
        );

      if (dateSuffixMatch) {

        q =
          dateSuffixMatch[1]
            .trim()
            .toUpperCase();

        date =
          dateSuffixMatch[2]
            .trim()
            .toUpperCase();

        yearSuffix =
          (dateSuffixMatch[3] || new Date().getUTCFullYear().toString().slice(-2))
            .trim()
            .toUpperCase();
      }

      const isSYRawQuery =
        /^SY\+?(?:\/\d{2}[A-Z]{3}(?:\d{2})?)?$/.test(
          rawQuery.replace(/\s+/g, '')
        );

      // =========================
      // Load Log
      // =========================
      let log = null;

      // Archive
      if (date) {

        log =
          await getFlightLogByDate(
            date,
            yearSuffix
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

      const normalizedRaw = rawQuery.replace(/\s+/g, '');
      const syMatch = normalizedRaw.match(/^SY(\+)?(?:\/(\d{2}[A-Z]{3})(?:\d{2})?)?$/i);
      if (syMatch) {
        const preferNextDay = Boolean(syMatch[1]) && !date;
        const syDate = syMatch[2] ? syMatch[2].toUpperCase() : date;
        const syInfo = findSYInfo(log, syDate, { preferNextDay, preferredFlightNo: 'MU586' });
        if (!syInfo) {
          return res.json({ error: 'No SY section found for selected date.' });
        }
        const year = Number(yearSuffix || new Date().getUTCFullYear().toString().slice(-2));
        const fullYear = year >= 100 ? year : (year >= 70 ? 1900 + year : 2000 + year);
        const m = String(syInfo.flightDate || '').toUpperCase().match(/(\d{2})([A-Z]{3})(\d{2})?/);
        const months = { JAN:'01', FEB:'02', MAR:'03', APR:'04', MAY:'05', JUN:'06', JUL:'07', AUG:'08', SEP:'09', OCT:'10', NOV:'11', DEC:'12' };
        const yearFromFlight = m?.[3] ? (2000 + Number(m[3])) : fullYear;
        const isoDate = m ? `${yearFromFlight}-${months[m[2]] || '01'}-${m[1]}` : '';
        const syBagInfo = isoDate ? await getSyBagInfoByDate(isoDate, syInfo.flightDate) : null;
        return res.json({ sy: { ...syInfo, bagSheet: syBagInfo } });
      }
      if (isSYRawQuery) {
        return res.json({ error: 'SY query did not return SY payload.' });
      }


      let pax = null;
      const normalizedFF =
        q.replace(
          /\s+/g,
          ''
        );

      // =========================
      // BN Search
      // =========================
      if (
        /^\d{1,3}$/.test(q)
      ) {

        const bn =
          q.padStart(3, '0');

        pax =
          passengers[bn] ||
          findPassengerFromPRRecord(log, 'BN', bn);
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
      // Bagtag Search
      // Examples:
      // 3781829629
      // DL861161
      // =========================
      else if (
        /^(?:\d{5,12}|[A-Z]{1,3}\s*\d{3,12})$/i.test(q)
      ) {

        pax =
          findByBagtag(q);
      }

      // =========================
      // Seat Search
      // =========================
      else if (
        /^\d+[A-Z]$/i.test(q)
      ) {

        pax =
          findBySeat(q) ||
          findPassengerFromPRRecord(log, 'SEAT', q);
      }

      // =========================
      // FF Search
      // =========================
      else if (

        /^[A-Z]{2}\s*\d+$/i
          .test(q)

      ) {

        pax =
          findByFFNumber(normalizedFF);

        if (!pax) {

          pax =
            findPDByFFNumber(normalizedFF);
        }

        if (pax && pax.name === 'PD MEMBER') {
          pax =
            findPDPassengerByFFFromLog(
              log,
              normalizedFF
            ) || pax;
        }

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
          findByName(q) ||
          findPassengerFromPRRecord(log, 'NAME', q);
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

      const authContext =
        await resolveAuthContextFromRequest(req);
      const permissions = authContext.permissions;

      pax.membershipStatus =
        permissions.canViewMembership ? membershipStatus : null;

      const info240 =
        permissions.canView240Info
          ? await get240InfoByBnAndFlightDate({
              bn: pax.bn,
              flightDate: pax.flightDate
            })
          : null;

      res.json(
        applyPermissionFilter(
          pax,
          permissions,
          info240
        )
      );

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
