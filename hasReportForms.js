// Cell maps belong to the supplied forms; formulas and labels stay read-only.
const fs=require('node:fs/promises'),path=require('node:path');
const {calculate}=require('./public/public/has-report-math');
const JSZip=require('node:module').createRequire(require.resolve('exceljs'))('jszip');
const kinds=['terrific','expense'];
function field(kind,r,c,rows=15){
 if(kind==='terrific')return r>=3&&r<=rows&&c<=7;
 return r===4&&[1,6,8,10].includes(c)||r===7&&[1,7,10].includes(c)||r>=10&&r<=11&&[1,3,7].includes(c)||r>=14&&r<=21||r>=26&&r<=35||r>=40&&r<=43||r>=48&&r<=65||r===74&&c===10||r===77&&[1,5,7].includes(c);
}
const file=kind=>path.join(__dirname,'data','has-report-templates',kind+'.xlsx');
async function template(kind,month,scope,extraRows={}){
 const count=extraRows.terrificRows??13;if(kind==='terrific'&&(!Number.isInteger(count)||count<1||count>200))throw Error('Terrific Ten supports 1 to 200 rows.');
 const Excel=require('exceljs'),workbook=new Excel.Workbook();await workbook.xlsx.readFile(file(kind));const sheet=workbook.worksheets[0],rows=kind==='terrific'?count+2:77,columns=kind==='terrific'?7:11,cells={};
 if(kind==='terrific'){if(rows>15)sheet.duplicateRow(15,rows-15,true);else if(rows<15)sheet.spliceRows(rows+1,15-rows);}
 for(let r=1;r<=rows;r++)for(let c=1;c<=columns;c++){
  const cell=sheet.getCell(r,c);if(cell.isMerged&&cell.master!==cell)continue;
  const value=cell.value?.richText?cell.value.richText.map(t=>t.text).join(''):cell.value;
  const editable=field(kind,r,c,rows)&&!cell.formula;
  const numeric=kind==='terrific'?c===1:r>=10&&r<=11&&c===7||r>=14&&r<=21&&c>=9||r>=26&&r<=35&&c>=2||r>=40&&r<=43&&c>=4||r>=48&&r<=65&&c>=6||r===74&&c===10;
  cells[cell.address]={value:cell.formula?'':value instanceof Date?value.toISOString().slice(0,10):value??'',...(cell.formula?{formula:cell.formula}:{}),editable,formulaAllowed:editable&&numeric,type:'text',multiline:editable&&!numeric,numFmt:cell.numFmt||'',style:{background:cell.fill?.fgColor?.argb,bold:cell.font?.bold,align:cell.alignment?.horizontal}};
 }
 return {kind,month,scope,rows,columns,cells,days:[],...(kind==='terrific'?{extraRows:{terrificRows:count}}:{}),merges:sheet.model.merges,widths:Array.from({length:columns},(_,i)=>sheet.getColumn(i+1).width||12),hiddenColumns:[],heights:Array.from({length:rows},(_,i)=>sheet.getRow(i+1).height||20),sheetName:sheet.name,workbook};
}
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Patch only cell contents in the original package, preserving drawings,
// print settings, styles, merged ranges and every other template part.
async function exportForm(model){
 const zip=await JSZip.loadAsync(await fs.readFile(file(model.kind))),name='xl/worksheets/sheet1.xml';let xml=await zip.file(name).async('string');const results=calculate(model.cells);
 if(model.kind==='terrific'&&model.rows!==15){
  if(model.rows>15){const source=xml.match(/<row\b[^>]*\br="15"[^>]*>[\s\S]*?<\/row>/)?.[0];if(!source)throw Error('Terrific Ten row template is unavailable.');let added='';for(let row=16;row<=model.rows;row++)added+=source.replace(/\br="15"/,'r="'+row+'"').replace(/\br="([A-Z]+)15"/g,(_,column)=>'r="'+column+row+'"');xml=xml.replace('</sheetData>',added+'</sheetData>');}
  else xml=xml.replace(/<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g,(row,n)=>Number(n)>model.rows?'':row);
  xml=xml.replace(/(<dimension\b[^>]*ref=")[^"]+("[^>]*\/?>)/,'$1A1:G'+model.rows+'$2');
 }
 for(const [address,cell] of Object.entries(model.cells)){
  if(!cell.editable&&!cell.formula)continue;
  let value=cell.formula?results[address]:cell.value;
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&/[dy]/i.test(cell.numFmt))value=(Date.parse(value)-Date.UTC(1899,11,30))/86400000;
  const contents=cell.formula?'<f>'+escape(cell.formula)+'</f>'+(typeof value==='number'?'<v>'+value+'</v>':'<v>'+escape(value)+'</v>'):typeof value==='number'?'<v>'+value+'</v>':'<is><t xml:space="preserve">'+escape(value??'')+'</t></is>';
  const type=cell.formula?(typeof value==='number'?'':' t="e"'):typeof value==='number'?'':' t="inlineStr"';
  const pattern=new RegExp('<c\\b([^>]*\\br="'+address+'"[^>]*?)(?:/>|>[\\s\\S]*?</c>)');
  if(pattern.test(xml))xml=xml.replace(pattern,(_,attrs)=>'<c'+attrs.replace(/\/$/,'').replace(/\s+t="[^"]*"/g,'')+type+'>'+contents+'</c>');
  else xml=xml.replace(new RegExp('(<row\\b[^>]*\\br="'+address.match(/\d+/)[0]+'"[^>]*>)([\\s\\S]*?)(</row>)'),(_,start,body,end)=>start+body+'<c r="'+address+'"'+type+'>'+contents+'</c>'+end);
 }
 // Newly populated cells must retain ascending column order for Excel.
 xml=xml.replace(/(<row\b[^>]*>)([\s\S]*?)(<\/row>)/g,(_,start,body,end)=>{
  const cells=body.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)||[];
  const column=cell=>[...cell.match(/\br="([A-Z]+)\d+"/)[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
  return start+cells.sort((a,b)=>column(a)-column(b)).join('')+body.replace(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g,'')+end;
 });
 zip.file(name,xml);return zip.generateAsync({type:'nodebuffer'});
}
module.exports={kinds,field,template,exportForm};
