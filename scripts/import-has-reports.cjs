// Imports private source files into a private SQLite DB, never into version control.
const fs=require('node:fs'),path=require('node:path'),Database=require('better-sqlite3'),express=require('express');
async function main(){
 const [destination,daPath,wwhPath,station='LAX',account='MU']=process.argv.slice(2);if(!destination||!daPath||!wwhPath)throw Error('Usage: node scripts/import-has-reports.cjs <private.db> <DA.xlsx> <WWH.xlsx> [station] [account]');
 const db=new Database(path.resolve(destination)),app=express(),token=require('node:crypto').randomBytes(32).toString('hex');app.use(express.json({limit:'16mb'}));
 require('../hasReports').registerHasReports(app,{employees:{db},reportDb:db,profiles:{linked:()=>({station,account,name:'Excel import',position:'Business Manager'})},authenticate:async req=>{if(req.headers.authorization!=='Bearer '+token)throw Error('auth');return {uid:'private-excel-import'};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{for(const [kind,filePath] of [['da',daPath],['wwh',wwhPath]]){const file=fs.readFileSync(filePath).toString('base64');for(let m=1;m<=12;m++){const month='2026-'+String(m).padStart(2,'0'),base='http://127.0.0.1:'+server.address().port+'/has-report-api/'+kind+'/'+month,headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};const latest=await (await fetch(base,{headers})).json();const response=await fetch(base+'/import',{method:'POST',headers,body:JSON.stringify({revision:latest.revision,file})});if(!response.ok)throw Error(await response.text());}}
  console.log('Imported 24 monthly reports for '+station+'/'+account+' into '+path.resolve(destination));
 }finally{server.close();db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
