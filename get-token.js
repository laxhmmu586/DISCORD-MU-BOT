const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  '30017158772-k1frki5rvjl2u0t905gavmuskgnolpgc.apps.googleusercontent.com',
  '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',
  'http://localhost'
);

const code = '4/0AdkVLPyPwvjGXhA9skHZmIBGcUrpIn471DEGR61viCmChE9XVWNoNPI_RGvDz8vramRMbw';

async function getToken() {
  const { tokens } = await oauth2Client.getToken(code);
  console.log(tokens);
}

getToken().catch(console.error);