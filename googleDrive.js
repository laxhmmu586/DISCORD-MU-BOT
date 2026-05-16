const { google } = require('googleapis');

// ===============================
// Google Auth
// ===============================
const auth = new google.auth.GoogleAuth({

  credentials: {

    client_email:
      process.env.GOOGLE_CLIENT_EMAIL,

    private_key:
      process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/\\n/g, '\n')
  },

  scopes: [

    'https://www.googleapis.com/auth/drive.readonly'
  ]
});

// ===============================
// Drive Client
// ===============================
const drive =
  google.drive({

    version: 'v3',

    auth
  });

// ===============================
// Download File
// ===============================
async function downloadLog(fileId) {

  const response =
    await drive.files.get({

      fileId,

      alt: 'media'

    }, {

      responseType: 'text'
    });

  return response.data;
}

// ===============================
// Get Today Log
// ===============================
const LOG_NAMES = [
  'Flight Control.log',
  'Lake.log',
  'Ticketing.log'
];

async function downloadLogsInFolder(folderId, label) {

  const logs = [];

  for (const logName of LOG_NAMES) {

    const res =
      await drive.files.list({

        q:
          `'${folderId}' in parents and name = '${logName}' and trashed = false`,

        fields:
          'files(id,name,modifiedTime)',

        orderBy:
          'modifiedTime desc',

        pageSize:
          1
      });

    const file =
      res.data.files[0];

    if (!file) {

      console.log(
        `${label} ${logName} not found`
      );

      continue;
    }

    console.log(
      `Using ${label} ${logName}:`,
      file.modifiedTime || ''
    );

    const content =
      await downloadLog(file.id);

    logs.push(content);
  }

  if (!logs.length) {
    return null;
  }

  return logs.join('\n');
}

async function getLatestFlightLog() {

  try {

    const folderId =
      process.env.TODAY_FOLDER_ID;

    return await downloadLogsInFolder(
      folderId,
      'TODAY'
    );

  } catch (err) {

    console.error(
      'Today Log Error:',
      err
    );

    return null;
  }
}

// ===============================
// Get Archive Log
// Example:
// 11MAY
// ===============================
async function getFlightLogByDate(date) {

  try {

    const archiveRoot =
      process.env.ARCHIVE_FOLDER_ID;

    // ===========================
    // Folder Name
    // ===========================
    const folderName =
      `MU586 ${date}26`;

    // ===========================
    // Find Date Folder
    // ===========================
    const folderRes =
      await drive.files.list({

        q:
          `'${archiveRoot}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,

        fields:
          'files(id,name)',

        pageSize:
          1
      });

    const folder =
      folderRes.data.files[0];

    if (!folder) {

      console.log(
        'Archive folder not found:',
        folderName
      );

      return null;
    }

    console.log(
      'Using ARCHIVE:',
      folderName
    );

    return await downloadLogsInFolder(
      folder.id,
      `ARCHIVE ${folderName}`
    );

  } catch (err) {

    console.error(
      'Archive Error:',
      err
    );

    return null;
  }
}

// ===============================
// Exports
// ===============================
module.exports = {

  getLatestFlightLog,

  getFlightLogByDate
};
