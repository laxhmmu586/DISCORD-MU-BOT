'use strict';
// Run on Oracle with the writer stopped. Never put passenger data in stdout.
require('dotenv').config();
const {google}=require('googleapis');
const {createHash}=require('node:crypto');
const {CbsSqlite}=require('../cbsSqlite');
const {book,related}=require('../cbsStorage');
const path=require('node:path');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
 const filename=process.argv[2];if(!filename)throw Error('Usage: node scripts/import-cbs-sqlite.cjs /absolute/path/to/new-cbs.db');
 const auth=new google.auth.GoogleAuth({credentials:{client_email:process.env.GOOGLE_CLIENT_EMAIL,private_key:process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
 const sheets=google.sheets({version:'v4',auth}),snapshots=[];
 const books=[...new Set([book,...related.map(t=>t.book)])];
 for(const id of books){
  const meta=await sheets.spreadsheets.get({spreadsheetId:id,fields:'sheets(properties(sheetId,title))'});
  const tabs=meta.data.sheets.map(s=>s.properties).filter(t=>id===book||related.some(r=>r.book===id&&r.gid===t.sheetId));
  if(id!==book&&tabs.length!==related.filter(r=>r.book===id).length)throw Error('Required CBS related table is missing.');
  const imported=[];
  // Sequential requests avoid a burst against Sheets quota; batched rows remain
  // exactly in their source positions, including empty interior rows.
  for(const tab of tabs){const range="'"+tab.title.replace(/'/g,"''")+"'!A:ZZ";const response=await sheets.spreadsheets.values.get({spreadsheetId:id,range});imported.push({gid:tab.sheetId,title:tab.title,rows:response.data.values||[]});}
  snapshots.push({id,tabs:imported});
 }
 const db=new CbsSqlite(path.resolve(filename));
 try{
  // All books are imported atomically. Existing databases are never replaced.
  let rows=0;
  db.db.transaction(()=>{for(const snapshot of snapshots)db.importBook(snapshot.id,snapshot.tabs);
  for(const snapshot of snapshots)for(const tab of snapshot.tabs){const actual=db.get(snapshot.id,"'"+tab.title.replace(/'/g,"''")+"'!A:ZZ").data.values; if(digest(actual)!==digest(tab.rows))throw Error('CBS import verification failed.');rows+=tab.rows.length;}
  })();
  db.db.pragma('wal_checkpoint(TRUNCATE)');
  console.log(JSON.stringify({verified:true,books:snapshots.length,tables:snapshots.reduce((n,s)=>n+s.tabs.length,0),rows,revision:db.revision()}));
 }finally{db.db.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
