const coordinates=address=>{const [,column,row]=address.match(/^([A-Z]+)(\d+)$/);return {column,row:+row};};
const move=(address,at,count)=>{const a=coordinates(address);return a.column+(a.row>=at?a.row+count:a.row);};
function shiftFormula(formula,at,count){return formula.replace(/(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)|(\$?[A-Z]+\$?\d+)/gi,(text,start,end,single)=>{const shift=(ref,edge=false)=>ref.replace(/\d+$/,row=>+row>=at||edge&&+row===at-1?String(+row+count):row);return single?shift(single):shift(start)+':'+shift(end,true);});}
function days(sheet){const result=[];let header;sheet.eachRow((row,r)=>{const day=row.getCell(1).value;if(typeof day==='number'&&day>=1&&day<=31)result.push({day,start:r});if(row.getCell(12).value==='# Flights')header=r;});return result.map((entry,i)=>({...entry,end:(result[i+1]?.start||header)-1}));}
function validateRows(counts={}){if(!counts||Array.isArray(counts)||typeof counts!=='object'||Object.entries(counts).some(([day,n])=>!/^\d{1,2}$/.test(day)||+day<1||+day>31||!Number.isInteger(n)||n<0||n>20)||Object.values(counts).reduce((n,v)=>n+v,0)>200)throw Object.assign(Error('Use at most 20 added rows per day and 200 per month.'),{status:400});return counts;}
function applyExtraRows(sheet,counts={}){
 validateRows(counts);
 for(const [day,count] of Object.entries(counts).sort((a,b)=>+a[0]-+b[0])){
  if(!count)continue;const current=days(sheet).find(d=>d.day===+day);if(!current)throw Object.assign(Error('This date is outside the selected month.'),{status:400});const at=current.end+1;
  const merges=[...sheet.model.merges],formulas=[];sheet.eachRow(row=>row.eachCell(cell=>{if((!cell.isMerged||cell.master===cell)&&cell.formula)formulas.push([cell.address,cell.formula]);}));
  const style=Array.from({length:14},(_,i)=>JSON.parse(JSON.stringify(sheet.getCell(at-1,i+1).style))),height=sheet.getRow(at-1).height;
  for(const range of merges)sheet.unMergeCells(range);
  sheet.spliceRows(at,0,...Array.from({length:count},()=>[]));
  for(let r=at;r<at+count;r++){sheet.getRow(r).height=height;for(let c=1;c<=14;c++){sheet.getCell(r,c).value=null;sheet.getCell(r,c).style=JSON.parse(JSON.stringify(style[c-1]));}}
  for(const range of merges){const [start,end]=range.split(':'),a=coordinates(start),b=coordinates(end);let finish=move(end,at,count);if(a.row<at&&b.row===at-1&&['L','M','N'].includes(a.column))finish=b.column+(b.row+count);sheet.mergeCells(move(start,at,count)+':'+finish);}
  for(const [address,formula] of formulas)sheet.getCell(move(address,at,count)).value={formula:shiftFormula(formula,at,count)};
 }
 const last=days(sheet).at(-1);if(last&&Object.values(counts).some(Boolean))sheet.pageSetup.printArea='A1:N'+(last.end+3);
}
function moveValues(values,at,count,model){return Object.fromEntries(Object.entries(values).map(([address,value])=>[move(address,at,count),typeof value==='string'&&value.startsWith('=')&&model.cells[address]?.formulaAllowed?'='+shiftFormula(value.slice(1),at,count):value]));}
module.exports={days,validateRows,applyExtraRows,moveValues,shiftFormula};
