const {Readable}=require('node:stream');
function createBriefingArchiveDrive({drive=require('./pbbDrive').createPbbDrive()}={}){
 return {
  async reserveBriefingArchiveId(){const result=await drive.files.generateIds({count:1,space:'drive'});return result.data.ids[0];},
  async uploadBriefingArchive({id,name,bytes,folderId,reportId}){
   await drive.validateFolder(folderId);
   const existing=async()=>{const found=await drive.files.get({fileId:id,fields:'id,appProperties',supportsAllDrives:true});if(found.data.appProperties?.briefingReportId!==reportId)throw Error('Briefing Drive ID conflict');return found.data.id;};
   try{return await existing();}catch(error){if(Number(error.code||error.response?.status)!==404)throw error;}
   try{const result=await drive.files.create({requestBody:{id,name,mimeType:'application/pdf',parents:[folderId],appProperties:{briefingReportId:reportId}},media:{mimeType:'application/pdf',body:Readable.from([bytes])},fields:'id',supportsAllDrives:true});return result.data.id;}
   catch(error){if(Number(error.code||error.response?.status)!==409)throw error;return existing();}
  }
 };
}
module.exports={createBriefingArchiveDrive};
