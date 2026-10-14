const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
async function authorize(){
 require('dotenv').config({quiet:true});const {google}=require('googleapis'),root=process.cwd(),envFile=path.join(root,'.env');
 const clientId=process.env.PBB_DRIVE_CLIENT_ID||process.env.GOOGLE_CLIENT_ID||process.env.GMAIL_CLIENT_ID,clientSecret=process.env.PBB_DRIVE_CLIENT_SECRET||process.env.GOOGLE_CLIENT_SECRET||process.env.GMAIL_CLIENT_SECRET,redirect=process.env.PBB_DRIVE_REDIRECT_URI||process.env.GOOGLE_REDIRECT_URI||process.env.GMAIL_REDIRECT_URI||'http://localhost';
 if(!clientId||!clientSecret)throw Error('OAuth client credentials must be configured on the server.');
 const target=new URL(redirect);if(!['localhost','127.0.0.1'].includes(target.hostname)||target.protocol!=='http:')throw Error('This helper requires a configured localhost HTTP redirect.');
 const auth=new google.auth.OAuth2(clientId,clientSecret,redirect),state=crypto.randomBytes(32).toString('hex'),verifier=await auth.generateCodeVerifierAsync();
 const url=auth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/drive'],include_granted_scopes:true,state,code_challenge:verifier.codeChallenge,code_challenge_method:'S256'});
 const folderId=process.env.PBB_DRIVE_FOLDER_ID||'1wMyB23ikaAnbkhJZcKBKBNujEeeY7Xsu';let handling=false;
 const server=http.createServer(async(req,res)=>{
  const callback=new URL(req.url,redirect);if(callback.pathname!==target.pathname){res.writeHead(404).end();return;}
  if(callback.searchParams.get('state')!==state||handling){res.writeHead(400).end('Invalid authorization state.');return;}
  handling=true;
  try{
   const code=callback.searchParams.get('code');if(!code)throw Error('Authorization was not granted.');
   const {tokens}=await auth.getToken({code,codeVerifier:verifier.codeVerifier});if(!tokens.refresh_token)throw Error('No refresh token returned. Please run authorization again.');auth.setCredentials(tokens);
   const drive=google.drive({version:'v3',auth});const response=await drive.files.get({fileId:folderId,fields:'id,mimeType,capabilities(canAddChildren)',supportsAllDrives:true});
   if(response.data.mimeType!=='application/vnd.google-apps.folder'||response.data.capabilities?.canAddChildren===false)throw Error('This account cannot upload into the selected PBB folder.');
   // Store the dedicated refresh token directly on the server. Never print tokens or codes.
   const before=fs.readFileSync(envFile,'utf8'),line='PBB_DRIVE_REFRESH_TOKEN='+tokens.refresh_token,next=/^PBB_DRIVE_REFRESH_TOKEN=.*$/m.test(before)?before.replace(/^PBB_DRIVE_REFRESH_TOKEN=.*$/m,line):before.trimEnd()+'\n'+line+'\n',temporary=envFile+'.pbb-oauth-'+crypto.randomBytes(8).toString('hex');fs.writeFileSync(temporary,next,{mode:0o600,flag:'wx'});fs.renameSync(temporary,envFile);
   res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'}).end('PBB Google Drive authorization saved. You can close this tab.');console.log('PBB_DRIVE_AUTHORIZED: folder access verified; dedicated credential saved.');
  }catch(error){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'}).end('Authorization could not be completed. Return to Codex for details.');console.error('Authorization failed: '+error.message);}
  finally{clearTimeout(timeout);server.close();}
 });
 const timeout=setTimeout(()=>{console.log('Authorization expired.');server.close();},20*60*1000);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.PBB_OAUTH_CALLBACK_PORT||8055),'127.0.0.1',resolve);});console.log('Redirect port: '+(target.port||'80'));console.log('AUTHORIZE_URL: '+url);
}
if(require.main===module)authorize().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={authorize};
