'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const [baseArg,fixArg,outArg,version]=process.argv.slice(2);assert(baseArg&&fixArg&&outArg&&/^\d+\.\d+\.\d+$/.test(version));
 const base=path.resolve(baseArg),fix=path.resolve(fixArg),out=path.resolve(outArg);assert(!await fs.stat(out).then(()=>true,()=>false),'Use a new output directory');assert(!out.startsWith(base+path.sep)&&!out.startsWith(fix+path.sep));
 const baseSource=path.join(base,'app-source'),fixSource=path.join(fix,'app-source'),source=path.join(out,'app-source');
 const baseMetadata=JSON.parse(await fs.readFile(path.join(baseSource,'package.json'),'utf8')),fixMetadata=JSON.parse(await fs.readFile(path.join(fixSource,'package.json'),'utf8'));
 assert.equal(baseMetadata.version,'2.1.10');assert.equal(fixMetadata.version,'2.1.11');assert(version.localeCompare(fixMetadata.version,undefined,{numeric:true})>0);
 await fs.mkdir(out,{recursive:true});await fs.cp(baseSource,source,{recursive:true});await fs.mkdir(path.join(out,'dist'),{recursive:true});await fs.cp(path.join(base,'release-app'),path.join(out,'dist/win-unpacked'),{recursive:true});await fs.mkdir(path.join(out,'release-app'));await fs.copyFile(path.join(base,'release-app/MUFC-icon-2.0.9.ico'),path.join(out,'release-app/MUFC-icon-2.0.9.ico'));
 await fs.copyFile(path.join(fixSource,'src/local-charge-exchange.js'),path.join(source,'src/local-charge-exchange.js'));
 const serverPath=path.join(source,'src/server.js'),server=await fs.readFile(serverPath,'utf8');await fs.writeFile(serverPath,require('./desktop-dual-trust/patch-server.cjs')(server));
 const chargePath=path.join(source,'web/charge-form.js'),charge=await fs.readFile(chargePath,'utf8'),anchor="peopleApi('/briefing-api/charge-form').then(result=>{";
 assert(charge.includes(anchor),'Charge Form defaults changed; inspect the base');await fs.writeFile(chargePath,charge.replace(anchor,"peopleApi('/briefing-api/charge-form').then(async result=>{if(window.mufcDesktop)result.exchange=await peopleApi('/briefing-api/charge-form/exchange');"));
 const configPath=path.join(source,'update-config.json'),config=JSON.parse(await fs.readFile(configPath,'utf8')),fixConfig=JSON.parse(await fs.readFile(path.join(fixSource,'update-config.json'),'utf8'));
 for(const [id,key]of Object.entries(fixConfig.keys)){assert(!config.keys[id]||config.keys[id]===key,'Key ID conflict');config.keys[id]=key;}
 config.coreCertificateThumbprints=[...new Set([...config.coreCertificateThumbprints,...fixConfig.coreCertificateThumbprints])];config.sources=['https://api.mufcapp.net/desktop-updates/stable/'+version+'/'];
 await fs.writeFile(configPath,JSON.stringify(config,null,2));await fs.writeFile(path.join(source,'package.json'),JSON.stringify({...baseMetadata,version},null,2));
 for(const name of ['MUFC-New-Release.cer','MUFC-Original-Release.cer','installer-trust.nsh','trust-certificates.ps1'])await fs.copyFile(path.join(fix,name),path.join(out,name));
 const build=JSON.parse(await fs.readFile(path.join(fix,'electron-builder.json'),'utf8'));build.win.signtoolOptions.sign=path.join(__dirname,'desktop-dual-trust/builder-sign.cjs');await fs.writeFile(path.join(out,'electron-builder.json'),JSON.stringify(build,null,2));
 await fs.writeFile(path.join(out,'release-plan.json'),JSON.stringify({channel:'stable',coreVersion:version,bundledRoot:path.join(source,'web'),sequence:1,validHours:24*7,keyId:'mufc-lax-20261108'},null,2));
 const allowed=new Set(['package.json','update-config.json','src/server.js','web/charge-form.js']),changed=[],missing=[];let preserved=0;
 async function verify(dir,prefix=''){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const relative=prefix+entry.name;if(entry.isDirectory())await verify(path.join(dir,entry.name),relative+'/');else{let current;try{current=await fs.readFile(path.join(source,relative));}catch{missing.push(relative);continue;}const original=await fs.readFile(path.join(baseSource,relative));if(original.equals(current))preserved++;else{assert(allowed.has(relative),'Unexpected base change: '+relative);changed.push(relative);}}}}
 await verify(baseSource);assert.equal(missing.length,0,'Base files must not be removed');
 const report={version,baseVersion:baseMetadata.version,fixVersion:fixMetadata.version,baseFilesPreservedExactly:preserved,changedBaseFiles:changed,newFiles:['src/local-charge-exchange.js'],missingBaseFiles:missing};await fs.writeFile(path.join(out,'merge-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
