'use strict';
require('dotenv').config();
if(!process.argv[2])throw Error('Pass a staging CBS database path, never the live database.');
process.env.CBS_SQLITE_PATH=process.argv[2];
process.env.CBS_STORAGE='sqlite';
const {performance}=require('node:perf_hooks');
const storage=require('../cbsStorage'),drive=require('../googleDrive');
(async()=>{
 const outputs=[];
 for(const name of ['getCbsCases','getWrongBaggageSubmissions','getCbsUnresolvedBaggageCases','getCbsWorldTracerCases','getCbsMissingBagReports','getContactFormSubmissions','getTestBaggageReportRows']){
  const start=performance.now(),rows=await drive[name]({includeResolved:true,forceRefresh:true});
  const coldMs=performance.now()-start,warm=performance.now();await drive[name]({includeResolved:true});
  outputs.push({name,rows:Array.isArray(rows)?rows.length:null,jsonBytes:Buffer.byteLength(JSON.stringify(rows)),coldMs:Number(coldMs.toFixed(2)),warmMs:Number((performance.now()-warm).toFixed(2))});
 }
 const modules=require('../cbsModules'),cases=await drive.getCbsCases(),bags=await drive.getCbsUnresolvedBaggageCases({includeResolved:true}),scopes=[['passenger-open',modules.select(cases,{view:'open'})],['passenger-closed-latest-month',modules.select(cases,{view:'closed'})],['onhand-open',modules.select(bags,{view:'open',group:'on-hand'},'onhand')],['bag-room-open',modules.select(bags,{view:'open',group:'bag-room'},'onhand')]].map(([name,data])=>({name,rows:data.rows.length,jsonBytes:Buffer.byteLength(JSON.stringify(data))}));
 console.log(JSON.stringify({results:outputs,scopes,revision:storage.local().revision(),databaseBytes:require('node:fs').statSync(process.argv[2]).size}));
 storage.local().db.close();
})().catch(error=>{console.error(error.message);process.exitCode=1;});
