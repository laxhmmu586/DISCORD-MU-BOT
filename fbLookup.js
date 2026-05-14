const fs = require('fs');
const { google } = require('googleapis');

// =====================================
// Google Drive Config
// =====================================

const FOLDER_ID =
  '1cKMKdeW4BbBY47_hMAW_N_lxnCt0Pulo';

const FILE_NAME =
  'Flight Control.log';

// =====================================
// Build Google Auth
// =====================================

function getGoogleAuth() {

  const raw =
    process.env.GOOGLE_CREDENTIALS;

  if (!raw) {

    throw new Error(
      'GOOGLE_CREDENTIALS variable missing'
    );
  }

  let credentials;

  try {

    credentials = JSON.parse(raw);

  } catch (err) {

    console.error(raw);

    throw new Error(
      'GOOGLE_CREDENTIALS JSON invalid'
    );
  }

  return new google.auth.GoogleAuth({

    credentials,

    scopes: [
      'https://www.googleapis.com/auth/drive.readonly'
    ]

  });
}

// =====================================
// Download Latest Flight Log
// =====================================

async function downloadLogFile() {

  const auth = getGoogleAuth();

  const drive = google.drive({

    version: 'v3',

    auth

  });

  // Find latest file
  const res = await drive.files.list({

    q:
      `'${FOLDER_ID}' in parents and name='${FILE_NAME}'`,

    fields:
      'files(id, name, modifiedTime)',

    orderBy:
      'modifiedTime desc',

    pageSize: 1

  });

  if (!res.data.files.length) {

    throw new Error(
      'Flight Control.log not found'
    );
  }

  const fileId =
    res.data.files[0].id;

  // Download file
  const response =
    await drive.files.get(

      {
        fileId,
        alt: 'media'
      },

      {
        responseType: 'arraybuffer'
      }

    );

  fs.writeFileSync(

    FILE_NAME,

    Buffer.from(response.data)

  );

  console.log(
    '✅ Flight log downloaded'
  );
}

// =====================================
// Lounge Logic
// =====================================

function canInviteGuest(
  tier,
  elite,
  seat
) {

  const row = parseInt(
    seat.match(/\d+/)?.[0] || '0'
  );

  // Elite (*1)
  if (elite === 1) {
    return false;
  }

  // Common Member
  if (tier === 'C') {
    return false;
  }

  // Platinum
  if (tier === 'V') {
    return true;
  }

  // Gold / Silver after row 20
  if (
    (tier === 'G' || tier === 'S')
    && row > 20
  ) {
    return false;
  }

  return true;
}

// =====================================
// Tier Name
// =====================================

function getTierName(tier) {

  switch (tier) {

    case 'V':
      return '白金';

    case 'G':
      return '金卡';

    case 'S':
      return '银卡';

    case 'C':
      return '普通会员';

    default:
      return null;
  }
}

// =====================================
// Elite Name
// =====================================

function getEliteName(elite) {

  if (!elite) return null;

  return elite === 2
    ? 'Elite Plus'
    : 'Elite';
}

// =====================================
// Lookup Passenger
// =====================================

async function lookupPassenger(bn) {

  // Download latest file
  await downloadLogFile();

  // Read file
  const data = fs.readFileSync(
    FILE_NAME,
    'utf8'
  );

  // Flight Info
  const flightMatch = data.match(
    /PR:\s+(MU\d+)\/(\d{2}[A-Z]{3})/i
  );

  const flightNo =
    flightMatch?.[1] || '';

  const flightDate =
    flightMatch?.[2] || '';

  // Search passenger block
  const regex = new RegExp(

    `BN${bn}[\\s\\S]{0,3000}?FF\\/MU[\\s\\S]{0,500}`,

    'i'
  );

  const match = data.match(regex);

  if (!match) {
    return null;
  }

  const block = match[0];

  // =====================================
  // Name + Seat
  // =====================================

  const nameSeatMatch = block.match(

    /1\.\s+([A-Z\/]+)[\s\S]*?BN\d+\s+(\d+[A-Z])/i

  );

  const name =
    nameSeatMatch?.[1] || '';

  const seat =
    nameSeatMatch?.[2] || '';

  // =====================================
  // FF Info
  // =====================================

  const ffMatch = block.match(

    /FF\/MU\s+(\d+)\/([VGSC])\/\*(\d)/i

  );

  // No FF
  if (!ffMatch) {

    return {

      flightNo,
      flightDate,
      name,
      seat,
      noFF: true

    };
  }

  const memberNo = ffMatch[1];

  const tier = ffMatch[2];

  const elite =
    parseInt(ffMatch[3]);

  const allowed =
    canInviteGuest(
      tier,
      elite,
      seat
    );

  return {

    flightNo,
    flightDate,
    name,
    seat,
    memberNo,
    tier,
    elite,
    allowed

  };
}

// =====================================
// Export
// =====================================

module.exports = (client) => {

  client.on(
    'messageCreate',
    async (message) => {

      try {

        if (message.author.bot) return;

        // FB 071
        if (
          /^FB\s*\d{3}$/i.test(
            message.content
          )
        ) {

          const bn = message.content
            .replace(/FB/i, '')
            .trim()
            .padStart(3, '0');

          console.log(
            `🔍 Searching BN${bn}`
          );

          const searchingMsg =
            await message.reply(
              `🔍 Searching BN${bn}...`
            );

          const result =
            await lookupPassenger(bn);

          // Not Found
          if (!result) {

            return searchingMsg.edit(
              `❌ BN${bn} not found`
            );
          }

          // No FF
          if (result.noFF) {

            let msg = '';

            if (
              result.flightNo ||
              result.flightDate
            ) {

              msg +=
`✈️ ${result.flightNo} / ${result.flightDate}

`;
            }

            if (result.name) {
              msg += `👤 ${result.name}\n`;
            }

            if (result.seat) {
              msg += `💺 Seat: ${result.seat}\n`;
            }

            msg += `
⚠️ 没有会员号`;

            return searchingMsg.edit(msg);
          }

          const tierName =
            getTierName(result.tier);

          const eliteName =
            getEliteName(
              result.elite
            );

          const statusText =
            result.allowed
              ? '🟢 Guest Allowed'
              : '🔴 Guest NOT Allowed';

          let finalMsg = '';

          // Flight
          if (
            result.flightNo ||
            result.flightDate
          ) {

            finalMsg +=
`✈️ ${result.flightNo} / ${result.flightDate}

`;
          }

          // Name
          if (result.name) {
            finalMsg +=
              `👤 ${result.name}\n`;
          }

          // Seat
          if (result.seat) {
            finalMsg +=
              `💺 Seat: ${result.seat}\n`;
          }

          // Tier
          if (tierName) {
            finalMsg +=
              `🎖 ${tierName}\n`;
          }

          // Elite
          if (eliteName) {
            finalMsg +=
              `⭐ ${eliteName}\n`;
          }

          // Member
          if (result.memberNo) {
            finalMsg +=
              `🆔 ${result.memberNo}\n`;
          }

          finalMsg +=
`\n${statusText}`;

          await searchingMsg.edit(
            finalMsg
          );
        }

      } catch (err) {

        console.error(err);

        message.reply(`
❌ Error

${err.message}
        `);
      }
    }
  );
};