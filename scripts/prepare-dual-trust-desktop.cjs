const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'output/mufc-desktop-2.1.11'),base=path.join(root,'output/mufc-desktop-2.1.9'),keys=process.argv[2];
 assert(keys&&(process.argv.includes('--resume')||!await fs.stat(out).then(()=>true,()=>false)));await fs.mkdir(out,{recursive:true});
 await fs.cp(path.join(base,'app-source'),path.join(out,'app-source'),{recursive:true});
 await fs.cp(path.join(base,'release-app'),path.join(out,'release-app'),{recursive:true});
 const source=path.join(out,'app-source'),config=JSON.parse(await fs.readFile(path.join(source,'update-config.json'),'utf8'));
 const envelope=JSON.parse(await fs.readFile(path.join(root,'output/ui-2.1.10-manifest.json'),'utf8')),payload=Buffer.from(envelope.payload,'base64');
 assert(crypto.verify(null,payload,config.keys[envelope.keyId],Buffer.from(envelope.signature,'base64')));
 const old=JSON.parse(payload);for(const file of old.hotfix.files){const response=await fetch('https://api.mufcapp.net/desktop-updates/stable/2.1.10/files/'+file.sha256,{redirect:'error'});assert(response.ok);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,file.size);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);const target=path.join(source,'web',file.path);assert(target.startsWith(path.join(source,'web')+path.sep));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
 await fs.copyFile(path.join(root,'output/local-data-fix/charge-form.js'),path.join(source,'web/charge-form.js'));
 await fs.copyFile(path.join(root,'scripts/desktop-dual-trust/local-charge-exchange.cjs'),path.join(source,'src/local-charge-exchange.js'));
 const serverPath=path.join(source,'src/server.js');await fs.writeFile(serverPath,require('./desktop-dual-trust/patch-server.cjs')(await fs.readFile(serverPath,'utf8')));
 config.keys['mufc-lax-20261108']=await fs.readFile(path.join(keys,'hotfix-public.pem'),'utf8');
 const cert=JSON.parse((await fs.readFile(path.join(keys,'certificate.json'),'utf8')).replace(/^\uFEFF/,''));
 config.coreCertificateThumbprints=[...new Set([...config.coreCertificateThumbprints,cert.thumbprint])];config.sources=['https://api.mufcapp.net/desktop-updates/stable/2.1.11/'];
 await fs.writeFile(path.join(source,'update-config.json'),JSON.stringify(config,null,2));
 const metadata=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));metadata.version='2.1.11';await fs.writeFile(path.join(source,'package.json'),JSON.stringify(metadata,null,2));
 for(const [from,to] of [[path.join(keys,'MUFC-Release.cer'),'MUFC-New-Release.cer'],[path.join(root,'output/desktop-updates-tools/MUFC-Release.cer'),'MUFC-Original-Release.cer']])await fs.copyFile(from,path.join(out,to));
 const build=JSON.parse(await fs.readFile(path.join(root,'output/mufc-desktop-2.1.4/electron-builder.json'),'utf8'));build.win.signAndEditExecutable=true;build.win.signtoolOptions={sign:path.join(root,'scripts/desktop-dual-trust/builder-sign.cjs'),signingHashAlgorithms:['sha256']};build.nsis.include='installer-trust.nsh';build.publish=null;
 await fs.writeFile(path.join(out,'electron-builder.json'),JSON.stringify(build,null,2));
 const trust=`param([string]$Directory)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -Force
foreach($entry in @(@('MUFC-Original-Release.cer','877C05BF6EA092C78B8C5A3F081BF25855EFB390'),@('MUFC-New-Release.cer','${cert.thumbprint}'))){
 $file=Join-Path $Directory $entry[0];$cert=New-Object Security.Cryptography.X509Certificates.X509Certificate2 $file
 if($cert.Thumbprint -cne $entry[1] -or $cert.HasPrivateKey -or $cert.NotAfter -lt (Get-Date) -or -not ($cert.EnhancedKeyUsageList|Where-Object ObjectId -EQ '1.3.6.1.5.5.7.3.3')){throw 'MUFC certificate verification failed.'}
 foreach($store in @('Root','TrustedPublisher')){& certutil.exe -user -f -addstore $store $file | Out-Null;if($LASTEXITCODE -ne 0){throw 'MUFC certificate enrollment failed.'}}
}
`;
 await fs.writeFile(path.join(out,'trust-certificates.ps1'),trust);
 const nsis=`!macro customInstall
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Allow MUFC to trust its original and new internal release certificates for your Windows user? This enables verification of future signed updates." IDYES trustMufc
  Abort
  trustMufc:
  InitPluginsDir
  File /oname=$PLUGINSDIR\\MUFC-Original-Release.cer "\${PROJECT_DIR}\\MUFC-Original-Release.cer"
  File /oname=$PLUGINSDIR\\MUFC-New-Release.cer "\${PROJECT_DIR}\\MUFC-New-Release.cer"
  File /oname=$PLUGINSDIR\\trust-certificates.ps1 "\${PROJECT_DIR}\\trust-certificates.ps1"
  nsExec::ExecToStack '"$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\trust-certificates.ps1" -Directory "$PLUGINSDIR"'
  Pop $0
  Pop $1
  \${If} $0 != 0
    MessageBox MB_ICONSTOP "MUFC certificate verification failed. $1"
    Abort
  \${EndIf}
!macroend
`;
 await fs.writeFile(path.join(out,'installer-trust.nsh'),nsis);
 console.log(JSON.stringify({out,version:metadata.version,keyIds:Object.keys(config.keys),thumbprints:config.coreCertificateThumbprints,preservedUi:old.hotfix.id},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
