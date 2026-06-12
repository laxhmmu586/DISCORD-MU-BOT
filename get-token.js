const { google } = require('googleapis');
const readline = require('readline');

const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID || '30017158772-k1frki5rvjl2u0t905gavmuskgnolpgc.apps.googleusercontent.com';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || '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';
const redirectUri = process.env.GOOGLE_REDIRECT_URI || process.env.GMAIL_REDIRECT_URI || 'http://localhost';

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const scopes = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send'
];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

async function getToken() {
  const code = process.env.GOOGLE_AUTH_CODE || process.env.GMAIL_AUTH_CODE || process.argv[2];
  if (!code) {
    const url = oauth2Client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: scopes });
    console.log('Open this URL, approve Gmail read/send access, then rerun with the returned code:');
    console.log(url);
    const enteredCode = await ask('Code: ');
    if (!enteredCode) return;
    const { tokens } = await oauth2Client.getToken(enteredCode);
    console.log(tokens);
    return;
  }
  const { tokens } = await oauth2Client.getToken(code);
  console.log(tokens);
}

getToken().catch(console.error);
