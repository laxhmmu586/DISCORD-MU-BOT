const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  '30017158772-k1frki5rvjl2u0t905gavmuskgnolpgc.apps.googleusercontent.com',
  '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',
  'http://localhost'
);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/gmail.readonly'
  ]
});

console.log('\n打开下面网址授权：\n');
console.log(url);