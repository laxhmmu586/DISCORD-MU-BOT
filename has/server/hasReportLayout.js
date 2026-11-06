function field(kind,row,column,formula){
 if(kind==='da')return {editable:row>=6&&column>=3&&column<=13&&!formula,formulaAllowed:row>=6&&[5,6,7,8,9,11,12,13].includes(column),type:row>=6&&column>=5&&column<=9?'time':'text',multiline:column===10};
 const weekly=row>=5&&row<=10&&column>=3&&column<=29&&column!==26&&column!==27;
 const inputFormula=Boolean(formula&&weekly&&(column===3||/^[\d\s.+*/()-]+$/.test(formula)));
 const comment=(column===2&&(row>=13&&row<=18||row>=20&&row<=25))||(column===1&&[32,39,48,51].includes(row))||(row===54&&column===2);
 const delay=row>=35&&row<=37&&[2,3,4,5,6,10].includes(column),safety=row>=42&&row<=46&&[2,3,4,6,10].includes(column);
 const editable=inputFormula||!formula&&(weekly||comment||delay||safety||row===4&&[16,17,18,19,28].includes(column));
 const unit=row>=5&&row<=11&&column>=20&&column<=27?(column===21?'hours':'count'):undefined;
 return {editable:Boolean(editable),formulaAllowed:weekly||delay&&column===5||row===4&&[16,17,18,19,28].includes(column),multiline:comment||delay&&[6,10].includes(column)||safety&&[4,6,10].includes(column),type:'text',inputFormula,displayDecimals:unit==='count'?0:2,...(unit?{unit}:{} )};
}
function selectExportSheet(workbook,sheetName){
 const index=workbook.worksheets.findIndex(sheet=>sheet.name===sheetName&&sheet.state==='visible');
 if(index<0)throw Error('The selected report sheet is unavailable.');
 workbook.views=(workbook.views?.length?workbook.views:[{}]).map(view=>({...view,activeTab:index,firstSheet:index}));
 for(const sheet of workbook.worksheets){
  const selected=sheet.name===sheetName;
  sheet.views=(sheet.views?.length?sheet.views:[{state:'normal'}]).map(view=>{
   if(!selected)return {...view,tabSelected:false};
   const column=view.state==='frozen'?(view.xSplit||0)+1:1,row=view.state==='frozen'?(view.ySplit||0)+1:1;
   let n=column,letters='';while(n){n--;letters=String.fromCharCode(65+n%26)+letters;n=Math.floor(n/26);}
   const start=letters+row;
   return {...view,tabSelected:true,activeCell:start,topLeftCell:start};
  });
 }
}
async function exportWorkbook(workbook,sheetName){
 if(sheetName)selectExportSheet(workbook,sheetName);
 const JSZip=require('node:module').createRequire(require.resolve('exceljs'))('jszip'),zip=await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
 for(const name of Object.keys(zip.files))if(/^xl\/comments\d+\.xml$/.test(name)||/^xl\/drawings\/vmlDrawing\d+\.vml$/.test(name))zip.remove(name);
 for(const name of Object.keys(zip.files)){
  if(/^xl\/worksheets\/sheet\d+\.xml$/.test(name)){const text=await zip.file(name).async('string');zip.file(name,text.replace(/<legacyDrawing\b[^>]*\/>/g,''));}
  if(/^xl\/worksheets\/_rels\/sheet\d+\.xml.rels$/.test(name)){const text=await zip.file(name).async('string');zip.file(name,text.replace(/<Relationship\b(?=[^>]*Type="[^"]*\/(?:comments|vmlDrawing)")[^>]*\/>/g,''));}
 }
 const types=await zip.file('[Content_Types].xml').async('string');zip.file('[Content_Types].xml',types.replace(/<Override\b(?=[^>]*PartName="\/xl\/comments\d+\.xml")[^>]*\/>/g,''));
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
}
module.exports={field,exportWorkbook,selectExportSheet};
