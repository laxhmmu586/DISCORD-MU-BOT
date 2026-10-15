const SPREADSHEET_ID='12NH3eQTx6GuOWHWgi4kxI0UsKgaJXW_ceKDnMGF3Zlo';
const SHEET_ID=1378812072;
function createScheduleReader({google=require('googleapis').google,env=process.env}={}){
  let client,title;
  function getClient(){
    if(client)return client;
    let auth;
    // Reuse the already-authorized archive account; the Gmail token is mail-only.
    if(env.PBB_DRIVE_REFRESH_TOKEN){
      auth=new google.auth.OAuth2(env.PBB_DRIVE_CLIENT_ID||env.GOOGLE_CLIENT_ID||env.GMAIL_CLIENT_ID,env.PBB_DRIVE_CLIENT_SECRET||env.GOOGLE_CLIENT_SECRET||env.GMAIL_CLIENT_SECRET,env.PBB_DRIVE_REDIRECT_URI||env.GOOGLE_REDIRECT_URI||env.GMAIL_REDIRECT_URI||'http://localhost');
      auth.setCredentials({refresh_token:env.PBB_DRIVE_REFRESH_TOKEN});
    }else{
      auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
    }
    client=google.sheets({version:'v4',auth});return client;
  }
  return async function read(){
    const sheets=getClient(),spreadsheetId=env.ETAB_SCHEDULE_SHEET_ID||SPREADSHEET_ID;
    if(!title){
      const meta=await sheets.spreadsheets.get({spreadsheetId,fields:'sheets.properties'},{timeout:15000});
      title=meta.data.sheets.find(s=>s.properties.sheetId===SHEET_ID)?.properties.title;
      if(!title)throw Error('ETAB Live Schedule tab (gid '+SHEET_ID+') was not found');
    }
    const result=await sheets.spreadsheets.values.get({spreadsheetId,range:"'"+title.replaceAll("'","''")+"'!A1:ZZ1000",valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'},{timeout:15000});
    return result.data.values||[];
  };
}
module.exports={createScheduleReader,SPREADSHEET_ID,SHEET_ID};
