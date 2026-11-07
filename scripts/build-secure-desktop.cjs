'use strict';
// VERIFIED_2.1.4_INSTALLER NEW_OUTPUT CONFIG_JSON VERSION BUILD_TOOLS_NODE_MODULES
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {digest}=require('./desktop-updates/updater.cjs');
(async()=>{
 const [installer,out,configuration,version,modules]=process.argv.slice(2);assert(installer&&out&&configuration&&modules&&/^\d+\.\d+\.\d+$/.test(version));
 assert.equal(digest(await fs.readFile(installer)),'6715e572a2aba3f37057dc2babf43da3f7a06b388d1f313f9fe17918c4e62413','Unknown 2.1.4 installer; audit before building');
 const output=path.resolve(out),tools=path.resolve(modules);assert(!await fs.stat(output).then(()=>true,()=>false),'Output must be new');
 const runtime=path.join(output,'runtime'),source=path.join(output,'source');await fs.mkdir(output,{recursive:true});
 const run=async(file,args,options={})=>{const result=await promisify(execFile)(file,args,{windowsHide:true,maxBuffer:4*1024*1024,...options});if(result.stdout)process.stdout.write(result.stdout);};
 await run(path.join(tools,'7zip-bin/win/x64/7za.exe'),['x',path.resolve(installer),'-o'+runtime,'-y']);
 const asar=require(path.join(tools,'@electron/asar'));asar.extractAll(path.join(runtime,'resources/app.asar'),source);
 const config=JSON.parse(await fs.readFile(configuration,'utf8'));require('./desktop-updates/patch.cjs').apply(source,config);
 const metadata=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));assert(version.localeCompare(metadata.version,undefined,{numeric:true})>0);metadata.version=version;await fs.writeFile(path.join(source,'package.json'),JSON.stringify(metadata,null,2));
 await asar.createPackage(source,path.join(runtime,'resources/app.asar'));
 const thumbprint=config.coreCertificateThumbprints?.[0];assert(/^[A-F0-9]{40}$/.test(thumbprint),'Windows signing certificate required');
 const signScript=path.join(__dirname,'desktop-updates/sign-core.ps1');
 await run('powershell.exe',['-NoProfile','-NonInteractive','-File',signScript,'-File',path.join(runtime,'MUFC.exe'),'-Thumbprint',thumbprint]);
 const builder={appId:'net.mufcapp.desktop',productName:'MUFC',directories:{output:path.join(output,'dist')},electronVersion:'44.5.1',win:{target:[{target:'nsis',arch:['x64']}],icon:path.join(runtime,'MUFC-icon-2.0.9.ico'),signAndEditExecutable:false,signtoolOptions:{sign:path.join(__dirname,'desktop-updates/builder-sign.cjs'),publisherName:['MUFC Internal Release Signing']}},nsis:{guid:'5a6c7831-3468-5ffd-9b41-c0363ea00568',oneClick:false,perMachine:true,allowToChangeInstallationDirectory:true,runAfterFinish:false,artifactName:'MUFC-Setup-'+version+'.exe'}};
 const builderFile=path.join(output,'builder.json');await fs.writeFile(builderFile,JSON.stringify(builder,null,2));
 await run(process.execPath,[path.join(tools,'electron-builder/cli.js'),'--prepackaged',runtime,'--projectDir',source,'--config',builderFile,'--win','nsis','--x64'],{env:{...process.env,MUFC_SIGNING_THUMBPRINT:thumbprint}});
 console.log('Built and signed MUFC '+version+' in '+path.join(output,'dist'));
})().catch(error=>{console.error(error);process.exitCode=1;});
