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

  getFlightLogByDate,
  get240InfoByBnAndFlightDate

} = require('./googleDrive');

const {

  Client,

  GatewayIntentBits

} = require('discord.js');

const fbLookup =
  require('./fbLookup');

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

app.use(
  express.json()
);

app.use(
  express.static('public')
);

const USERS = {
  '21470': { password: 'admin', level: 'admin', fixedUsername: true, lastPasswordChange: '2026-05-17' },
  '23239': { password: 'admin', level: 'manager', fixedUsername: true, lastPasswordChange: '2026-05-17' },
  '27199': { password: 'admin', level: 'manager', fixedUsername: true, lastPasswordChange: '2026-05-17' },
  demi: { password: 'mulax', level: 'agent', lastPasswordChange: '2026-05-17' },
  vicky: { password: 'mulax', level: 'agent', lastPasswordChange: '2026-05-17' },
  haoran: { password: 'mulax', level: 'agent', lastPasswordChange: '2026-05-17' },
  cho: { password: 'mulax', level: 'agent', lastPasswordChange: '2026-05-17' },
  mulounge: { password: 'mulax', level: 'lounge', lastPasswordChange: '2026-05-17' }
};

const sessions = new Map();
const PASSWORD_EXPIRE_DAYS = 90;
const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

const ROLE_PERMISSIONS = {
  admin: { docs: true, bnDetail: true, bags: true, inbound: true, outbound: true, ssr: true, meal: true, paid: true, info240: true },
  manager: { docs: true, bnDetail: true, bags: true, inbound: true, outbound: true, ssr: true, meal: true, paid: true, info240: true },
  agent: { docs: false, bnDetail: true, bags: true, inbound: true, outbound: true, ssr: true, meal: true, paid: true, info240: true },
  lounge: { docs: false, bnDetail: false, bags: false, inbound: false, outbound: false, ssr: false, meal: false, paid: false, info240: false }
};


function createSession(username) {
  const token = `${username}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  sessions.set(token, { username, createdAt: Date.now(), lastActiveAt: Date.now() });
  return token;
}

function authFromReq(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.lastActiveAt > SESSION_IDLE_TIMEOUT_MS) {
    sessions.delete(token);
    return null;
  }
  session.lastActiveAt = Date.now();
  return { ...session, token, user: USERS[session.username] };
}

function needsPasswordReset(user) {
  const changedAt = new Date(user.lastPasswordChange || '1970-01-01T00:00:00Z');
  const elapsedDays = (Date.now() - changedAt.getTime()) / (1000 * 60 * 60 * 24);
  return elapsedDays >= PASSWORD_EXPIRE_DAYS;
}

function applyVisibilityRules(pax, level) {
  if (!pax || level === 'admin' || level === 'manager') return pax;
  const clone = { ...pax };

  if (level === 'agent') {
    delete clone.paxInfoRaw;
    delete clone.passportRaw;
    delete clone.passportNumber;
    delete clone.nationality;
    delete clone.dob;
    delete clone.birthDate;
    delete clone.gender;
    delete clone.passportExpiry;
    delete clone.expiryDate;
    delete clone.info240;
  }

  if (level === 'lounge') {
    return {
      flight: clone.flight,
      flightDate: clone.flightDate,
      name: clone.name,
      bn: clone.bn,
      seat: clone.seat,
      cabin: clone.cabin,
      ticketNumber: clone.ticketNumber,
      ffCarrier: clone.ffCarrier,
      ffNumber: clone.ffNumber,
      membershipStatus: clone.membershipStatus,
      lounge: clone.lounge
    };
  }

  return clone;
}

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

// ===============================
// Search API
// ===============================
app.get(

  '/search',

  async (req, res) => {

    try {

      const auth = authFromReq(req);
      if (!auth || !auth.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      let q =
        (
          req.query.q || ''
        )
        .trim()
        .toUpperCase();

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

      const dateSuffixMatch =
        q.match(
          /^(.*)\/(\d{2}[A-Z]{3})$/i
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
            'Unable to load logs (Flight Control.log / Lake.log / Ticketing.log)'
        });
      }

      // =========================
      // Parse
      // =========================
      parseIncrementalLog(log);

      parsePDLog(log);

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
      const fullData = {

        ...pax,
        info240:
          await get240InfoByBnAndFlightDate({
            bn: pax.bn,
            flightDate: pax.flightDate
          }),

        membershipStatus
      };

      res.json(
        applyVisibilityRules(fullData, auth.user.level)
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

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = USERS[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = createSession(username);
  return res.json({
    token,
    username,
    level: user.level,
    mustChangePassword: needsPasswordReset(user),
    passwordLastChanged: user.lastPasswordChange
  });
});

app.post('/auth/change-password', (req, res) => {
  const auth = authFromReq(req);
  if (!auth || !auth.user) return res.status(401).json({ error: 'Unauthorized' });
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Missing old/new password' });
  if (auth.user.password !== oldPassword) return res.status(400).json({ error: 'Old password incorrect' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'New password too short' });
  auth.user.password = newPassword;
  auth.user.lastPasswordChange = new Date().toISOString().slice(0, 10);
  return res.json({ success: true, passwordLastChanged: auth.user.lastPasswordChange });
});

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


app.post('/auth/logout', (req, res) => {
  const auth = authFromReq(req);
  if (auth?.token) sessions.delete(auth.token);
  res.json({ success: true });
});

app.get('/auth/me', (req, res) => {
  const auth = authFromReq(req);
  if (!auth || !auth.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ username: auth.username, level: auth.user.level, permissions: ROLE_PERMISSIONS[auth.user.level] || {}, mustChangePassword: needsPasswordReset(auth.user), passwordLastChanged: auth.user.lastPasswordChange });
});

app.get('/admin/users', (req, res) => {
  const auth = authFromReq(req);
  if (!auth || !auth.user) return res.status(401).json({ error: 'Unauthorized' });
  if (auth.user.level !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const users = Object.entries(USERS).map(([username, user]) => ({ username, level: user.level, lastPasswordChange: user.lastPasswordChange }));
  res.json({ users });
});

app.post('/admin/users/level', (req, res) => {
  const auth = authFromReq(req);
  if (!auth || !auth.user) return res.status(401).json({ error: 'Unauthorized' });
  if (auth.user.level !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username, level } = req.body || {};
  const allow = new Set(['admin', 'manager', 'agent', 'lounge']);
  if (!USERS[username]) return res.status(404).json({ error: 'User not found' });
  if (!allow.has(level)) return res.status(400).json({ error: 'Invalid level' });
  USERS[username].level = level;
  res.json({ success: true });
});


app.post('/admin/users/reset-password', (req, res) => {
  const auth = authFromReq(req);
  if (!auth || !auth.user) return res.status(401).json({ error: 'Unauthorized' });
  if (auth.user.level !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username, newPassword } = req.body || {};
  if (!USERS[username]) return res.status(404).json({ error: 'User not found' });
  if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ error: 'New password too short' });
  USERS[username].password = String(newPassword);
  USERS[username].lastPasswordChange = new Date().toISOString().slice(0, 10);
  res.json({ success: true });
});

app.post('/admin/users/add', (req, res) => {
  const auth = authFromReq(req);
  if (!auth || !auth.user) return res.status(401).json({ error: 'Unauthorized' });
  if (auth.user.level !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username, password, level } = req.body || {};
  const allow = new Set(['admin', 'manager', 'agent', 'lounge']);
  if (!username || !password || !level) return res.status(400).json({ error: 'Missing username/password/level' });
  if (USERS[username]) return res.status(400).json({ error: 'User already exists' });
  if (!allow.has(level)) return res.status(400).json({ error: 'Invalid level' });
  USERS[username] = { password: String(password), level, lastPasswordChange: new Date().toISOString().slice(0, 10) };
  res.json({ success: true });
});


app.post('/admin/users/delete', (req, res) => {
  const auth = authFromReq(req);
  if (!auth || !auth.user) return res.status(401).json({ error: 'Unauthorized' });
  if (auth.user.level !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username } = req.body || {};
  if (!username || !USERS[username]) return res.status(404).json({ error: 'User not found' });
  if (username === auth.username) return res.status(400).json({ error: 'Cannot delete current admin' });
  delete USERS[username];
  res.json({ success: true });
});

app.get('/admin/permissions', (req, res) => {
  const auth = authFromReq(req);
  if (!auth || !auth.user) return res.status(401).json({ error: 'Unauthorized' });
  if (auth.user.level !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json({ permissions: ROLE_PERMISSIONS });
});

app.post('/admin/permissions', (req, res) => {
  const auth = authFromReq(req);
  if (!auth || !auth.user) return res.status(401).json({ error: 'Unauthorized' });
  if (auth.user.level !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { permissions } = req.body || {};
  if (!permissions || typeof permissions !== 'object') return res.status(400).json({ error: 'Invalid permissions' });
  const roles = ['admin', 'manager', 'agent', 'lounge'];
  for (const role of roles) {
    if (!permissions[role] || typeof permissions[role] !== 'object') continue;
    ROLE_PERMISSIONS[role] = { ...ROLE_PERMISSIONS[role], ...permissions[role] };
  }
  res.json({ success: true, permissions: ROLE_PERMISSIONS });
});
