// Patch a verified Windows release without rebuilding its native boarding engine.
// BASE_APP OUTPUT VERSION ASAR_MODULE
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const [baseArg,outputArg,version,asarModule]=process.argv.slice(2);
 assert(baseArg&&outputArg&&/^\d+\.\d+\.\d+$/.test(version)&&asarModule,'Expected BASE_APP OUTPUT VERSION ASAR_MODULE');
 const base=path.resolve(baseArg),output=path.resolve(outputArg),root=path.resolve(__dirname,'..');
 assert(!fs.existsSync(output),'Choose a new output directory');assert(!output.startsWith(base+path.sep),'Output must be outside the base app');
 const asar=require(path.resolve(asarModule)),archive=path.join(base,'resources/app.asar');
 const baseVersion=JSON.parse(asar.extractFile(archive,'package.json')).version;
 assert(version.localeCompare(baseVersion,undefined,{numeric:true})>0,'Version must increase');
 fs.mkdirSync(output,{recursive:true});const release=path.join(output,'release-app'),source=path.join(output,'app-source');
 fs.cpSync(base,release,{recursive:true});asar.extractAll(archive,source);
 const changed=[];
 function write(name,content){fs.mkdirSync(path.dirname(path.join(source,name)),{recursive:true});fs.writeFileSync(path.join(source,name),content);changed.push(name);}
 const telex=fs.readFileSync(path.join(root,'public/public/flight-telex.js'),'utf8').replace('sy.permissions?.canViewSpecialService !== false','sy.permissions?.canViewSpecialService === true');
 assert(telex.includes('sy.permissions?.canViewSpecialService === true'),'Desktop SSR permission gate required');write('web/flight-telex.js',telex);
 const previousCbs=fs.readFileSync(path.join(source,'web/cbs.html'),'utf8');
 const stream=previousCbs.match(/    function connectCbsLiveSync\(\) \{[\s\S]*?\n    \}/)?.[0];assert(stream?.includes('connectCbsStream'),'Preserve authenticated desktop live events');
 let cbs=fs.readFileSync(path.join(root,'public/public/cbs.html'),'utf8');
 cbs=cbs.replace('<script src="/__/firebase/init.js"></script>','<script src="/__/firebase/init.js"></script><script src="/desktop-lbs.js"></script><script src="/cbs-stream.js"></script>')
  .replace(/    function connectCbsLiveSync\(\) \{[\s\S]*?\n    \}/,stream);
 write('web/cbs.html',cbs);
 for(const match of cbs.matchAll(/(?:src|href)="\/([^"?]+\.(?:js|css))(?:\?[^\"]*)?"/g)){
  const name=match[1],file=path.join(root,'public/public',name);
  if(name==='__/firebase/init.js')continue; // Supplied by the desktop server.
  if(fs.existsSync(file))write('web/'+name,fs.readFileSync(file));
  else assert(fs.existsSync(path.join(source,'web',name)),'Missing desktop dependency: '+name);
 }
 const metadata=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));metadata.version=version;write('package.json',JSON.stringify(metadata,null,2)+'\n');
 const target=path.join(release,'resources/app.asar');await asar.createPackage(source,target);
 const expected=new Set(changed),actual=[];
 for(const entry of asar.listPackage(archive)){
  const native=path.normalize(entry.replace(/^[\\/]/,'')),name=native.replace(/\\/g,'/'),stat=asar.statFile(archive,native,false);
  if(stat.files)continue;
  if(stat.link){assert.equal(asar.statFile(target,native,false).link,stat.link,'Preserve archive link: '+name);continue;}
  if(!asar.extractFile(archive,native).equals(asar.extractFile(target,native))){assert(expected.has(name),'Unexpected change: '+name);actual.push(name);}
 }
 for(const name of expected)assert(asar.extractFile(target,path.normalize(name)).equals(fs.readFileSync(path.join(source,name))));
 const manifest={version,baseVersion,changed:actual,patchedFiles:[...expected],archiveSha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')};
 fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
