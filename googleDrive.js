const { google } = require('googleapis');

// ===============================
// Google Auth
// ===============================
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/drive.readonly']
});

// ===============================
// Google Drive Client
// ===============================
const drive = google.drive({
  version: 'v3',
  auth
});

// ===============================
// Download File Content
// ===============================
async function downloadLog(fileId) {
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' }
  );
  return response.data;
}

// ===============================
// Get Today Flight Control.log
// ===============================
async function getLatestFlightLog() {
  try {
    const folderId = process.env.TODAY_FOLDER_ID;

    const res = await drive.files.list({
      q: `'${folderId}' in parents and name = 'Flight Control.log' and trashed = false`,
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 1
    });

    const file = res.data.files[0];
    if (!file) {
      console.log('Today log not found');
      return null;
    }

    console.log('Using TODAY log:', file.name, file.modifiedTime);
    return await downloadLog(file.id);
  } catch (err) {
    console.error('Today Log Error:', err);
    return null;
  }
}

// ===============================
// Get Historical Flight Control.log
// dateInput examples: '20APR' or '20APR27'
// ===============================
async function getFlightLogByDate(dateInput) {
  try {
    const archiveRoot = process.env.ARCHIVE_FOLDER_ID;

    // ===========================
    // Folder query
    // ===========================
    let folderQuery = '';
    if (/\d{1,2}[A-Z]{3}\d{2}$/.test(dateInput)) {
      // 精确年份匹配
      folderQuery = `name = 'MU586 ${dateInput}'`;
    } else {
      // 不固定年份，只要包含日期
      folderQuery = `name contains 'MU586 ${dateInput}'`;
    }

    // ===========================
    // Find Archive Folder
    // ===========================
    const folderRes = await drive.files.list({
      q: `'${archiveRoot}' in parents and ${folderQuery} and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id,name)',
      pageSize: 1
    });

    const folder = folderRes.data.files[0];
    if (!folder) {
      console.log('Archive folder not found for:', dateInput);
      return null;
    }

    // ===========================
    // Find Flight Control.log in Folder
    // ===========================
    const fileRes = await drive.files.list({
      q: `'${folder.id}' in parents and name = 'Flight Control.log' and trashed = false`,
      fields: 'files(id,name)',
      pageSize: 1
    });

    const file = fileRes.data.files[0];
    if (!file) {
      console.log('Archive log not found in folder:', folder.name);
      return null;
    }

    console.log('Using ARCHIVE log:', folder.name);
    return await downloadLog(file.id);
  } catch (err) {
    console.error('Archive Error:', err);
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