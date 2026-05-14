const { google } = require('googleapis');

// ===============================
// Google Auth
// ===============================
const auth = new google.auth.GoogleAuth({

  credentials: JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
  ),

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
// Get Latest Flight Control Log
// ===============================
async function getLatestFlightLog() {

  try {

    // ===========================
    // Find Flight Control.log
    // ===========================
    const res =
      await drive.files.list({

        q:
          `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents
          and name='Flight Control.log'
          and trashed=false`,

        pageSize:
          1,

        fields:
          'files(id,name,modifiedTime)'
      });

    const files =
      res.data.files;

    if (!files.length) {

      throw new Error(
        'Flight Control.log not found'
      );
    }

    const file =
      files[0];

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

      },

      {
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
// Export
// ===============================
module.exports = {

  getLatestFlightLog
};