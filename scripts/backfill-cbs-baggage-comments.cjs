// Run without --apply to preview. --apply requires a private SQLite backup path.
require('dotenv').config();
const path=require('node:path'),fs=require('node:fs');
(async()=>{
 const apply=process.argv.includes('--apply'),backupArg=process.argv.find(arg=>arg.startsWith('--backup='));
 const storage=require('../cbsStorage');
 if(!storage.enabled())throw Error('This repair requires CBS SQLite storage.');
 if(apply){
  if(!backupArg)throw Error('Supply --backup=/private/path/cbs-before-comments.db');
  const backup=path.resolve(backupArg.slice('--backup='.length));
  if(fs.existsSync(backup))throw Error('Backup already exists. Choose a new path.');
  fs.mkdirSync(path.dirname(backup),{recursive:true});await storage.local().db.backup(backup);
 }
 console.log(JSON.stringify(await require('../googleDrive').backfillCbsBaggageComments({apply})));
 storage.local().db.close();
})().catch(error=>{console.error(error.message);process.exitCode=1;});
