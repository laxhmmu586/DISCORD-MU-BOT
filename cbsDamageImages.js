'use strict';
const {createHash}=require('node:crypto');
const TITLE='CBS Damage Images',RANGE="'CBS Damage Images'";
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Separate rows avoid the Sheets 50,000-character cell limit. Case JSON keeps
// only a small, immutable reference; image bytes are never returned in case lists.
class CbsDamageImages {
 constructor(sheets,spreadsheetId){this.sheets=sheets;this.spreadsheetId=spreadsheetId;this.ready=null;}
 async ensureSheet(){
  if(!this.ready)this.ready=(async()=>{
   const exists=async()=>{const r=await this.sheets.spreadsheets.get({spreadsheetId:this.spreadsheetId,fields:'sheets.properties.title'});return r.data.sheets?.some(s=>s.properties.title===TITLE);};
   if(await exists())return;
   try{await this.sheets.spreadsheets.batchUpdate({spreadsheetId:this.spreadsheetId,requestBody:{requests:[{addSheet:{properties:{title:TITLE,hidden:true,gridProperties:{columnCount:4}}}}]}});}
   catch(error){if(!await exists())throw error;}
  })().catch(error=>{this.ready=null;throw error;});
  return this.ready;
 }
 async saveRecord(record){
  if(String(record.caseType).toUpperCase()!=='DPR')return;
  const entries=record.damagedBags?.length?record.damagedBags:[record];
  const images=entries.filter(d=>d.damageSketch&&!d.damageSketchRef).map(entry=>{
   if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(entry.damageSketch)||entry.damageSketch.length>4000000)throw new Error('Invalid damage image.');
   const base64=entry.damageSketch.split(',')[1],bytes=Buffer.from(base64,'base64');
   if(bytes[0]!==255||bytes[1]!==216)throw new Error('Invalid damage JPEG.');
   const id=hash(bytes),chunks=base64.match(/.{1,30000}/g);return {entry,id,chunks};
  });
  if(!images.length)return;
  await this.ensureSheet();
  const rows=images.flatMap(im=>im.chunks.map((part,i)=>[im.id,i,im.chunks.length,part]));
  const response=await this.sheets.spreadsheets.values.append({spreadsheetId:this.spreadsheetId,range:`${RANGE}!A:D`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:rows}});
  let row=Number(response.data?.updates?.updatedRange?.match(/!A(\d+):D\d+$/)?.[1]);
  if(!row)throw new Error('Damage image save was not acknowledged.');
  for(const im of images){im.entry.damageSketchRef=`${row}-${im.chunks.length}-${im.id}`;row+=im.chunks.length;}
 }
 async read(ref){
  const match=/^([1-9]\d{0,7})-([1-9]\d{0,2})-([a-f0-9]{64})$/.exec(String(ref));
  if(!match||Number(match[2])>134)return null;
  const [,start,count,id]=match;
  const response=await this.sheets.spreadsheets.values.get({spreadsheetId:this.spreadsheetId,range:`${RANGE}!A${start}:D${Number(start)+Number(count)-1}`});
  const rows=response.data.values||[];
  if(rows.length!==Number(count)||rows.some((r,i)=>r[0]!==id||Number(r[1])!==i||Number(r[2])!==Number(count)))return null;
  const bytes=Buffer.from(rows.map(r=>r[3]).join(''),'base64');
  return hash(bytes)===id?bytes:null;
 }
}
module.exports={CbsDamageImages};
