const test=require('node:test'),assert=require('node:assert/strict');
const {createBriefingArchiveDrive}=require('../briefingDrive');
test('Briefing archives use the authorized user Drive adapter and retry the reserved file ID',async()=>{
 let stored=false,creates=0,validated=0;
 const drive={validateFolder:async id=>{assert.equal(id,'folder');validated++;},files:{generateIds:async()=>({data:{ids:['reserved']}}),get:async()=>{if(!stored)throw Object.assign(Error('not found'),{code:404});return {data:{id:'reserved',appProperties:{briefingReportId:'report'}}};},create:async args=>{creates++;assert.equal(args.requestBody.id,'reserved');assert.deepEqual(args.requestBody.parents,['folder']);assert.equal(args.requestBody.appProperties.briefingReportId,'report');stored=true;return {data:{id:'reserved'}};}}};
 const archive=createBriefingArchiveDrive({drive}),item={id:await archive.reserveBriefingArchiveId(),name:'report.pdf',bytes:Buffer.from('%PDF'),folderId:'folder',reportId:'report'};
 assert.equal(await archive.uploadBriefingArchive(item),'reserved');assert.equal(await archive.uploadBriefingArchive(item),'reserved');assert.equal(creates,1);assert.equal(validated,2);
 await assert.rejects(archive.uploadBriefingArchive({...item,reportId:'different'}),/conflict/);assert.equal(creates,1);
});
