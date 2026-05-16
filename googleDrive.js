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
async function getLatestFlightLog() {

  try {

    const folderId =
      process.env.TODAY_FOLDER_ID;

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

    if (!file) {

      console.log(
        'Today log not found'
      );

      return null;
    }

    console.log(
      'Using TODAY log:',
      file.modifiedTime
    );

    return await downloadLog(
      file.id
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
    // ===========================
// Find Flight Control.log
// ===========================
const fileRes =
  await drive.files.list({

    q:
      `'${folder.id}' in parents and name = 'Flight Control.log' and trashed = false`,

    fields:
      'files(id,name)',

    pageSize:
      1
  });

const file =
  fileRes.data.files[0];

if (!file) {

  console.log(
    'Flight Control.log not found'
  );

  return null;
}

// ===========================
// Download Log
// ===========================
const response =
  await drive.files.get(

    {
      fileId: file.id,
      alt: 'media'
    },

    {
      responseType: 'text'
    }
  );

return response.data;
    // ===========================
    // Find Flight Control.log
    // ===========================
    const fileRes =
      await drive.files.list({

        q:
          `'${folder.id}' in parents and name = 'Flight Control.log' and trashed = false`,

        fields:
          'files(id,name)',

        pageSize:
          1
      });

    const file =
      fileRes.data.files[0];

    if (!file) {

      console.log(
        'Archive log not found'
      );

      return null;
    }

    console.log(
      'Using ARCHIVE:',
      folderName
    );

    return await downloadLog(
      file.id
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