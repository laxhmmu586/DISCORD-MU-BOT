require('dotenv').config();
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

async function test() {
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 5,
    q: 'in:inbox',
  });

  console.log(res.data.messages || []);
}

test().catch(console.error);