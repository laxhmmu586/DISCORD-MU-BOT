const { google } = require('googleapis');

// ===============================
// Google Auth
// ===============================
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/drive.readonly']
});

// ===============================
// Drive Client
// ===============================
const drive = google.drive({
  version: 'v3',
  auth
});

// ===============================
// Helper: Download single file by name
// ===============================
async function downloadFileByName(fileName) {
  try {
    const res = await drive.files.list({
      q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${fileName}' and trashed=false`,
      pageSize: 1,
      fields: 'files(id,name,modifiedTime)'
    });

    const files = res.data.files;

    if (!files.length) {
      console.warn(`${fileName} not found`);
      return '';
    }

    const file = files[0];

    console.log(`Using log: ${file.name}`);
    console.log(`Modified: ${file.modifiedTime}`);

    const response = await drive.files.get(
      {
        fileId: file.id,
        alt: 'media'
      },
      { responseType: 'text' }
    );

    return response.data || '';
  } catch (err) {
    console.error(`Google Drive Error (${fileName}):`, err);
    return '';
  }
}

// ===============================
// Get Combined Logs
// ===============================
async function getCombinedLogs() {
  // 三个文件依次获取
  const flightControlLog = await downloadFileByName('Flight Control.log');
  const lakeLog = await downloadFileByName('Lake.log');
  const ticketingLog = await downloadFileByName('Ticketing.log');

  // 合并成一个字符串返回
  return [flightControlLog, lakeLog, ticketingLog].join('\n');
}

// ===============================
// Export
// ===============================
module.exports = {
  getCombinedLogs
};