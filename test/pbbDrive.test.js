const test=require('node:test'),assert=require('node:assert/strict');
const {createPbbDrive,driveError}=require('../pbbDrive');
function fixture(folder){const calls=[];class OAuth2{constructor(...args){calls.push(['oauth',...args]);}setCredentials(value){calls.push(['credentials',value]);}}class GoogleAuth{constructor(){calls.push(['service']);}}
 const files={get:async opts=>{calls.push(['get',opts]);return {data:folder};},create:async opts=>({data:{id:opts.requestBody.id}}),generateIds:async()=>({data:{ids:['file-id']}})};return {calls,google:{auth:{OAuth2,GoogleAuth},drive:({auth})=>{calls.push(['drive',auth]);return {files};}}};}
test('PBB dedicated OAuth overrides Gmail and permits uploads in a personal folder',async()=>{
 const f=fixture({id:'folder',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}}),drive=createPbbDrive({google:f.google,env:{PBB_DRIVE_REFRESH_TOKEN:'dedicated',GOOGLE_REFRESH_TOKEN:'gmail',GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret'}});
 await drive.validateFolder('folder');await drive.files.generateIds({count:1});assert.equal(f.calls.find(c=>c[0]==='credentials')[1].refresh_token,'dedicated');assert.equal(f.calls.filter(c=>c[0]==='drive').length,1);assert.equal(f.calls.some(c=>c[0]==='service'),false);assert.equal(f.calls.find(c=>c[0]==='get')[1].supportsAllDrives,true);
});
test('service account rejects a personal folder but supports shared-drive folders',async()=>{
 for(const shared of [false,true]){const f=fixture({id:'folder',mimeType:'application/vnd.google-apps.folder',...(shared?{driveId:'shared'}:{})}),drive=createPbbDrive({google:f.google,env:{}});if(shared)assert.equal((await drive.validateFolder('folder')).driveId,'shared');else await assert.rejects(()=>drive.validateFolder('folder'),/OAuth connection/);}
});
test('upload preflight rejects a non-folder or read-only destination',async()=>{
 for(const folder of [{mimeType:'application/pdf'},{mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:false}}]){const f=fixture(folder);await assert.rejects(()=>createPbbDrive({google:f.google,env:{GOOGLE_REFRESH_TOKEN:'token',GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret'}}).validateFolder('folder'),/folder|editor/);}
});
test('Drive scope and quota errors explain the required connection',()=>{
 assert.match(driveError(new Error('Insufficient Permission')),/Authorize.*Drive/);assert.match(driveError(new Error('Service Accounts do not have storage quota.')),/OAuth/);assert.equal(driveError(new Error('Network unavailable')),'Network unavailable');
});
