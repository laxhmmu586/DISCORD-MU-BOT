// BASE_RUNTIME NEW_DIRECTORY ASAR_MODULE [VERSION]
// Produces an isolated client; never writes to the installed app or user data.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const [baseArg,outArg,asarArg,version='2.1.10']=process.argv.slice(2);
 assert(baseArg&&outArg&&asarArg,'BASE_RUNTIME NEW_DIRECTORY ASAR_MODULE required');assert(/^\d+\.\d+\.\d+$/.test(version));
 const base=path.resolve(baseArg),out=path.resolve(outArg),asar=require(path.resolve(asarArg));
 assert(!fs.existsSync(out),'Output must be a new directory');assert(!out.startsWith(base+path.sep),'Output cannot be inside the installed app');
 const source=path.join(out,'source'),runtime=path.join(out,'runtime'),archive=path.join(base,'resources/app.asar');
 assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,'2.1.9','Rebase this patch before using a different client baseline');
 fs.cpSync(base,runtime,{recursive:true,filter:file=>path.basename(file)!=='Uninstall MUFC.exe'});asar.extractAll(archive,source);
 const list=require('./client-glass-v2/files.json');
 for(const file of list){const target=path.join(source,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(__dirname,'client-glass-v2/files',file),target)}
 const recipe=require('./client-glass-v2/index-patch.json'),indexFile=path.join(source,'web/index.html');
 const originalIndex=fs.readFileSync(indexFile,'utf8').replace(/\r\n/g,'\n');
 assert.equal(crypto.createHash('sha256').update(originalIndex).digest('hex'),recipe.baseSha256,'Dashboard baseline changed; rebase the small patch first');
 const indexLines=originalIndex.match(/[^\n]*\n|[^\n]+$/g)||[];
 for(const edit of [...recipe.edits].reverse())indexLines.splice(edit.start,edit.end-edit.start,...edit.replacement);
 fs.writeFileSync(indexFile,indexLines.join(''));
 const packageFile=path.join(source,'package.json'),pkg=JSON.parse(fs.readFileSync(packageFile));pkg.version=version;fs.writeFileSync(packageFile,JSON.stringify(pkg,null,2)+'\n');
 const configFile=path.join(source,'update-config.json'),config=JSON.parse(fs.readFileSync(configFile));config.sources=[`https://api.mufcapp.net/desktop-updates/stable/${version}/`];fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n');
 const target=path.join(runtime,'resources/app.asar');await asar.createPackage(source,target);
 const allowed=new Set([...list,'web/index.html','package.json','update-config.json']);let changed=[];
 const normalize=name=>name.replace(/^[\\/]/,'').replaceAll('\\','/');
 const baselineEntries=asar.listPackage(archive),targetEntries=asar.listPackage(target),baselineSet=new Set(baselineEntries.map(normalize)),targetSet=new Set(targetEntries.map(normalize));
 for(const name of baselineEntries){
  const file=name.replace(/^[\\/]/,'').replaceAll('\\','/');if(asar.statFile(archive,path.normalize(file)).files)continue;
  assert(targetSet.has(file),'Baseline file removed: '+file);
  if(!asar.extractFile(archive,path.normalize(file)).equals(asar.extractFile(target,path.normalize(file)))){assert(allowed.has(file),'Unreviewed change: '+file);changed.push(file)}
 }
 const added=targetEntries.map(normalize).filter(file=>!asar.statFile(target,path.normalize(file)).files&&!baselineSet.has(file));
 assert(added.every(file=>allowed.has(file)),'Unreviewed added file');
 const manifest={version,baseline:'2.1.9',changed,added,sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
})().catch(error=>{console.error(error);process.exit(1)});


