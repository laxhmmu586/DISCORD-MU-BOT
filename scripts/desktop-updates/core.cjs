'use strict';
const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');
const fs=require('node:fs/promises');
const {digest}=require('./updater.cjs');
const quote=value=>"'"+String(value).replace(/'/g,"''")+"'";
const encoded=code=>Buffer.from(code,'utf16le').toString('base64');
async function scheduleCore(updater,pid=process.pid,stillSafe=()=>true) {
  const item=updater.coreReady;
  if(!item)return false;
  if(process.platform!=='win32')throw Error('Core installation requires Windows.');
  const pins=updater.config.coreCertificateThumbprints;
  if(!Array.isArray(pins)||!pins.length||pins.some(p=>! /^[A-F0-9]{40,64}$/.test(p)))throw Error('Core installation locked: Windows signing certificate is not configured.');
  const manifest=updater.verifyEnvelope(item.envelope);
  if(manifest.disabled||manifest.paused||updater.state.blocked.includes(item.release.id))throw Error('Core publication disabled.');
  if(await fs.stat(require('node:path').join(updater.directory,'disable-updates.json')).then(()=>true,()=>false))throw Error('Updates disabled locally.');
  if(digest(await fs.readFile(item.file))!==item.release.sha256)throw Error('Core file changed.');
  const check=`$ErrorActionPreference='Stop';Import-Module (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -Force;$file=${quote(item.file)};$sig=Get-AuthenticodeSignature -LiteralPath $file;if($sig.Status -ne 'Valid' -or $sig.SignatureType -ne 'Authenticode' -or @(${pins.map(quote).join(',')}) -notcontains $sig.SignerCertificate.Thumbprint){throw 'Untrusted Core publisher'};if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne ${quote(item.release.sha256)}){throw 'Core checksum failed'};`;
  // Validate now AND again after MUFC exits, immediately before running the EXE.
  await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded(check)],{windowsHide:true,timeout:30000});
  if(updater.coreReady!==item||updater.control?.sequence!==manifest.sequence||updater.control.paused||updater.control.disabled)throw Error('Core publication changed during verification.');
  if(!stillSafe())throw Error('页面已改变，安装已取消，请返回登录页重试。');
  const statusFile=require('node:path').join(updater.directory,'core-install-status.json');
  await fs.writeFile(statusFile,JSON.stringify({status:'starting',version:item.release.version,at:Date.now()}));
  const report=status=>`@{status=${quote(status)};version=${quote(item.release.version)};at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}|ConvertTo-Json|Set-Content -LiteralPath ${quote(statusFile)} -Encoding UTF8;`;
  const code=`try{Wait-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue;${check}${report('installing')}$installed=Start-Process -FilePath $file -ArgumentList '/S' -Verb RunAs -WindowStyle Hidden -Wait -PassThru;if($installed.ExitCode -ne 0){throw ('Installer exit code: '+$installed.ExitCode)};${report('installed')}}catch{@{status='failed';version=${quote(item.release.version)};error=$_.Exception.Message;at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}|ConvertTo-Json|Set-Content -LiteralPath ${quote(statusFile)} -Encoding UTF8;}finally{Start-Process -FilePath ${quote(process.execPath)} -WindowStyle Normal;}`;
  const helper=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded(code)],{detached:true,stdio:'ignore',windowsHide:true});
  await new Promise((resolve,reject)=>{helper.once('spawn',resolve);helper.once('error',reject);});
  helper.unref();return true;
}
module.exports={scheduleCore};
