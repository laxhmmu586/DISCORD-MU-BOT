'use strict';
const {execFile}=require('node:child_process');const {promisify}=require('node:util');
module.exports=async configuration=>{
 if(!/^[A-F0-9]{40}$/.test(process.env.MUFC_SIGNING_THUMBPRINT||''))throw Error('Pinned signing certificate required');
 await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-File',require('node:path').join(__dirname,'sign-core.ps1'),'-File',configuration.path,'-Thumbprint',process.env.MUFC_SIGNING_THUMBPRINT],{windowsHide:true,timeout:60000});
};
