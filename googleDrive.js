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
// Google Drive Client
// ===============================
const drive =
  google.drive({

    version: 'v3',

    auth
  });

// ===============================
// Get Latest Flight Control.log
// ===============================
async function getLatestFlightLog() {

  try {

    const folderId =
      process.env.GOOGLE_DRIVE_FOLDER_ID;

    // ===========================
    // Find File
    // ===========================
    const res =
      await drive.files.list({

        q:
          `'${folderId}' in parents and name = 'Flight Control.log' and trashed = false`,

        fields:
          'files(id,name,modifiedTime)',

        orderBy:
          'modifiedTime desc',

        pageSize:
          1
      });

    const file =
      res.data.files[0];

    // ===========================
    // File Not Found
    // ===========================
    if (!file) {

      console.log(
        'Flight Control.log not found'
      );

      return null;
    }

    console.log(
      'Using log:',
      file.name
    );

    console.log(
      'Modified:',
      file.modifiedTime
    );

    // ===========================
    // Download File
    // ===========================
    const response =
      await drive.files.get({

        fileId:
          file.id,

        alt:
          'media'

      }, {

        responseType:
          'text'
      });

    return response.data;

  } catch (err) {

    console.error(
      'Google Drive Error:',
      err
    );

    return null;
  }
}

// ===============================
// Exports
// ===============================
module.exports = {

  getLatestFlightLog
};