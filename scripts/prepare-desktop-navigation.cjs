// BASE_PROTECTED_APP NEW_OUTPUT VERSION ASAR_MODULE
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const [baseArg,outArg,version,asarArg]=process.argv.slice(2),root=path.resolve(__dirname,'..'),base=path.resolve(baseArg),out=path.resolve(outArg),asar=require(path.resolve(asarArg));
 assert(!fs.existsSync(out));assert(!out.startsWith(base+path.sep));assert(/^\d+\.\d+\.\d+$/.test(version));
 const release=path.join(out,'release-app'),source=path.join(out,'app-source');fs.cpSync(base,release,{recursive:true});asar.extractAll(path.join(base,'resources/app.asar'),source);
 const metadata=JSON.parse(fs.readFileSync(path.join(source,'package.json'))),baseVersion=metadata.version;assert(version.localeCompare(baseVersion,undefined,{numeric:true})>0);
 assert(fs.readFileSync(path.join(source,'src/server.js'),'utf8').includes('/desktop-auth'),'Protected desktop base required');
 metadata.version=version;fs.writeFileSync(path.join(source,'package.json'),JSON.stringify(metadata,null,2));
 const copied=require('./desktop-protection/navigation-patch.cjs').applyNavigation(source,root,release);
 await asar.createPackage(source,path.join(release,'resources/app.asar'));
 const manifest={version,baseVersion,copied,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(release,'resources/app.asar'))).digest('hex')};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
})().catch(e=>{console.error(e);process.exitCode=1;});
