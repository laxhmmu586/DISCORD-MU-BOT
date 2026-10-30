const {PDFDocument}=require('../../vendor/pdf-lib/pdf-lib');
const SPREADSHEET_ID='1-BnQrtRj6-uTgoC89uj8zQ1dZTcSh96QFRH-_Tf4JEQ';
const JOBS=[
 {flight:'MU583',sheet:'ARRIVAL',channelId:'1563411695936864447'},
 {flight:'MU586',sheet:'DEPARTURE',channelId:'1563411615351574528'}
];
const legacyChannels=new Set(['1252032351131799654','1252032370920656907',...JOBS.map(j=>j.channelId)]);
function isLegacyBriefing(body){return legacyChannels.has(String(body.channelId))&&/\bMU(?:583|586)\b.*\bBRIEFING SHEET\.pdf$/i.test(body.file?.name||'');}
async function validatePdf(bytes){
 if(bytes.length>8*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid briefing PDF export');
 const doc=await PDFDocument.load(bytes);
 if(doc.getPageCount()!==1||doc.getPages()[0].getWidth()>=doc.getPages()[0].getHeight())throw Error('Briefing export must be one portrait page');
 return bytes;
}
function createGoogleExporter({getSheets,getClient}){
 return async job=>{
  if(!JOBS.some(j=>j.sheet===job.sheet&&j.flight===job.flight))throw Error('Unknown briefing sheet');
  const sheets=getSheets(),meta=await sheets.spreadsheets.get({spreadsheetId:SPREADSHEET_ID,fields:'sheets.properties(sheetId,title)'},{timeout:30000});
  const sheet=meta.data.sheets.find(s=>s.properties.title===job.sheet);if(!sheet)throw Error('Missing briefing sheet: '+job.sheet);
  const query=new URLSearchParams({format:'pdf',gid:String(sheet.properties.sheetId),range:'A1:R67',size:'letter',portrait:'true',scale:'4',sheetnames:'false',printtitle:'false',pagenum:'UNDEFINED',gridlines:'false',fzr:'false',horizontal_alignment:'CENTER',vertical_alignment:'TOP',top_margin:'0.10',bottom_margin:'0.10',left_margin:'0.10',right_margin:'0.10'});
  const client=await getClient(),response=await client.request({url:'https://docs.google.com/spreadsheets/d/'+SPREADSHEET_ID+'/export?'+query,responseType:'arraybuffer',timeout:30000,retry:false});
  return {bytes:await validatePdf(Buffer.from(response.data)),viewUrl:'https://docs.google.com/spreadsheets/d/'+SPREADSHEET_ID+'/edit#gid='+sheet.properties.sheetId};
 };
}
// Retired: Google Sheets PDF + link posts are no longer scheduled.
// Keep a no-op compatibility interface so older callers cannot restart delivery.
function createBriefingService(){return {async tick(){},start(){},close(){}};}
module.exports={JOBS,SPREADSHEET_ID,isLegacyBriefing,createGoogleExporter,createBriefingService,validatePdf};
