function driveError(error){
 const message=String(error?.message||'Drive upload failed');
 if(/service accounts.*storage quota/i.test(message))return 'Google Drive needs a user OAuth connection for this folder; service accounts have no personal storage quota.';
 if(/insufficient.*permission|insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(message)||error?.response?.data?.error?.errors?.some(e=>e.reason==='insufficientPermissions'))return 'Google Drive permission is missing. Authorize the archive upload account for Drive, then retry.';
 return message;
}
function createPbbDrive({env=process.env,google=require('googleapis').google}={}){
 let client,authMode;
 function getClient(){
  if(client)return client;
  const refresh=env.PBB_DRIVE_REFRESH_TOKEN||env.DRIVE_REFRESH_TOKEN||env.GOOGLE_REFRESH_TOKEN||env.GMAIL_REFRESH_TOKEN;
  let auth;
  if(refresh){
   const id=env.PBB_DRIVE_CLIENT_ID||env.DRIVE_CLIENT_ID||env.GOOGLE_CLIENT_ID||env.GMAIL_CLIENT_ID,secret=env.PBB_DRIVE_CLIENT_SECRET||env.DRIVE_CLIENT_SECRET||env.GOOGLE_CLIENT_SECRET||env.GMAIL_CLIENT_SECRET;
   if(!id||!secret)throw Error('Google Drive OAuth client ID and secret are not configured.');
   auth=new google.auth.OAuth2(id,secret,env.PBB_DRIVE_REDIRECT_URI||env.GOOGLE_REDIRECT_URI||env.GMAIL_REDIRECT_URI||'http://localhost');auth.setCredentials({refresh_token:refresh});authMode='oauth';
  }else{auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/drive.file']});authMode='service';}
  client=google.drive({version:'v3',auth});return client;
 }
 return {files:Object.fromEntries(['get','create','generateIds'].map(method=>[method,(...args)=>getClient().files[method](...args)])),async validateFolder(folderId){
  const drive=getClient(),response=await drive.files.get({fileId:folderId,fields:'id,mimeType,driveId,capabilities(canAddChildren)',supportsAllDrives:true},{timeout:15000});const folder=response.data;
  if(folder.mimeType!=='application/vnd.google-apps.folder')throw Error('PBB archive destination must be a Google Drive folder.');
  if(folder.capabilities?.canAddChildren===false)throw Error('The archive upload account needs editor access to the PBB Drive folder.');
  if(authMode==='service'&&!folder.driveId)throw Error('Google Drive needs a user OAuth connection for this folder; service accounts have no personal storage quota.');
  return folder;
 }};
}
module.exports={createPbbDrive,driveError};
