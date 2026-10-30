const {SPREADSHEET_ID,SHEET_ID}=require('./etabSchedule');
const summary=require('./has/public/schedule-summary'),{digest}=require('./has/server/staffScheduleRoster');
const SOURCE_URL=`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${SHEET_ID}`;
const serialDate=n=>typeof n==='number'&&n>20000&&n<100000?new Date(Date.UTC(1899,11,30)+Math.round(n)*86400000).toISOString().slice(0,10):null;
const dateSerial=value=>Math.round((Date.parse(value+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);
function column(n){let value='';for(n++;n;n=Math.floor((n-1)/26))value=String.fromCharCode(65+(n-1)%26)+value;return value;}
const val=cell=>cell?.effectiveValue?.numberValue??cell?.userEnteredValue?.numberValue??cell?.effectiveValue?.stringValue??cell?.userEnteredValue?.stringValue??cell?.formattedValue??'';
const rgb=value=>value?'#'+['red','green','blue'].map(key=>Math.round((value[key]||0)*255).toString(16).padStart(2,'0')).join(''):null;
const color=value=>Object.fromEntries(['red','green','blue'].map((key,i)=>[key,parseInt(value.slice(1+i*2,3+i*2),16)/255]));
const key=(date,type,id='')=>JSON.stringify([date,type,id]);
const marker=/\n?\[MU_SCHEDULE_DATE\][^\n]*/g;
function dateMeta(cell){let labels=[];const match=String(cell?.note||'').match(/\[MU_SCHEDULE_DATE\]([^\n]*)/);if(match)try{const parsed=JSON.parse(match[1]);if(Array.isArray(parsed.labels))labels=parsed.labels.filter(v=>typeof v==='string'&&v.length<=30).slice(0,4);}catch{}return {dateColor:rgb(cell?.effectiveFormat?.backgroundColor)||null,labels};}
function parseSnapshot(data,employees,roles,colors){
 const sheet=data.sheets.find(s=>s.properties.sheetId===SHEET_ID);if(!sheet)throw Error('Live Schedule worksheet was not found.');
 const cells=new Map();for(const block of sheet.data||[])for(let r=0;r<(block.rowData||[]).length;r++)for(let c=0;c<(block.rowData[r].values||[]).length;c++)cells.set((r+(block.startRow||0))+','+(c+(block.startColumn||0)),block.rowData[r].values[c]);
 const cell=(r,c)=>cells.get(r+','+c)||{},width=sheet.properties.gridProperties.columnCount,dates=new Map(),items=new Map(),warnings=[];
 for(let c=3;c<width;c++){const date=serialDate(val(cell(1,c)));if(date)dates.set(date,c);}
 if(!dates.size)throw Error('The schedule date header has no valid Sheets dates.');
 let hoursRow=62;for(let r=3;r<Math.min(sheet.properties.gridProperties.rowCount,100);r++)if(String(val(cell(r,1))).toUpperCase().replace(/\s/g,'')==='DAILYHOUR'){hoursRow=r;break;}
 const budgetRow=hoursRow+1,periodBudgetRow=hoursRow+3,people=new Map();
 const put=(date,type,id,value,ref)=>items.set(key(date,type,id),{key:key(date,type,id),date,type,employeeId:id,value,ref});
 for(let r=3;r<hoursRow;r++){
  const name=String(val(cell(r,1))).trim();if(!name)continue;const base=digest(name),nick=name.match(/\(([^)]+)\)/)?.[1],sourceCode=String(val(cell(r,0))).trim();let matches=employees.filter(e=>[e.name,e.nickname].filter(Boolean).some(v=>digest(v)===base||(nick?.length>3&&digest(v)===digest(nick))));
  if(!matches.length&&/^\d+$/.test(sourceCode))matches=employees.filter(e=>String(e.code||'').split(/[^0-9]+/).filter(Boolean).includes(sourceCode));
  if(matches.length!==1){const group=['businessmanager','supervisor','flightcontrol','bagroom','arrival','arrivalcardassistant','checkin'].includes(name.toLowerCase().replace(/[^a-z]/g,'')),hasDuties=[...dates.values()].some(c=>Object.hasOwn(roles,String(val(cell(r,c))).trim().toUpperCase()));if(r<40&&!group&&(sourceCode||hasDuties))warnings.push('Employee row '+(r+1)+' could not be matched uniquely.');continue;}
  const employee=matches[0];if(people.has(employee.id))throw Error('Multiple Sheet rows match the same employee.');people.set(employee.id,r);
  put('','code',employee.id,String(val(cell(r,0))).trim(),{row:r,column:0});
  for(const [date,c] of dates){const source=cell(r,c),raw=String(val(source)).trim(),code=raw==='🏖️'?'VAC':raw.toUpperCase()==='G'?'GS':raw.toUpperCase();let assignment=null;
   if(code){if(!Object.hasOwn(roles,code)){if(/^[A-Z][A-Z0-9·/+ -]{0,7}$/.test(code)){roles[code]=code;colors[code]=rgb(source.effectiveFormat?.backgroundColor)||'#e9eaf0';}else{warnings.push('An unsupported Sheet annotation was left unchanged.');continue;}}assignment={code,color:rgb(source.effectiveFormat?.backgroundColor)||colors[code]};}
   put(date,'assignment',employee.id,assignment,{row:r,column:c,raw,formula:source.userEnteredValue?.formulaValue||''});
  }
 }
 for(const [date,c] of dates){const start=summary.periodStart(date),first=dates.get(start),weekly=first===undefined?null:Number(val(cell(periodBudgetRow,first))),entered=val(cell(budgetRow,c)),budget=typeof entered==='number'&&entered>=0?entered:Number.isFinite(weekly)&&weekly>0?Number((weekly/7).toFixed(4)):61;
  put(date,'budget','',budget,{row:budgetRow,column:c});put(date,'meta','',dateMeta(cell(1,c)),{row:1,column:c,note:cell(1,c).note||''});
 }
 const coverageRows=new Map(),aliases={management:'D',checkin:'C',checkinll:'CL',arrival:'A',gatespecialist:'GS',bagroomll:'BL',bagroom:'B',flightcontrolll:'FL',flightcontrol:'F',arrivalcardassistant:'Q',earlycheckin:'EC'};for(let r=3;r<hoursRow;r++){const label=String(val(cell(r,1))).toLowerCase().replace(/[^a-z]/g,'');if(aliases[label])coverageRows.set(aliases[label],r);}
 return {sheetId:SHEET_ID,title:sheet.properties.title,properties:sheet.properties.gridProperties,dates,people,items,budgetRow,periodBudgetRow,coverageRows,lastDate:[...dates.keys()].sort().at(-1),warnings};
}
function createSheetsTransport({env=process.env,google:providedGoogle,sheets:provided}={}){
 let client=provided,metadata=null,metadataAt=0;
 function sheets(){if(client)return client;const google=providedGoogle||require('googleapis').google;let auth;if(env.STAFF_SCHEDULE_AUTH_MODE==='drive'||env.ETAB_SCHEDULE_AUTH_MODE==='drive'){
  auth=new google.auth.OAuth2(env.PBB_DRIVE_CLIENT_ID||env.GOOGLE_CLIENT_ID,env.PBB_DRIVE_CLIENT_SECRET||env.GOOGLE_CLIENT_SECRET);auth.setCredentials({refresh_token:env.PBB_DRIVE_REFRESH_TOKEN});
 }else auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']});client=google.sheets({version:'v4',auth});return client;}
 async function read(employees,roles,colors){const api=sheets();if(!metadata||Date.now()-metadataAt>60000){const meta=await api.spreadsheets.get({spreadsheetId:SPREADSHEET_ID,fields:'sheets.properties'},{timeout:15000});metadata=meta.data.sheets.find(s=>s.properties.sheetId===SHEET_ID);metadataAt=Date.now();}const sheet=metadata;if(!sheet)throw Error('Live Schedule worksheet was not found.');const title="'"+sheet.properties.title.replaceAll("'","''")+"'",end=column(sheet.properties.gridProperties.columnCount-1),data=await api.spreadsheets.get({spreadsheetId:SPREADSHEET_ID,ranges:[`${title}!A1:${end}70`],includeGridData:true,fields:'sheets(properties,data(startRow,startColumn,rowData.values(formattedValue,effectiveValue,userEnteredValue,note,effectiveFormat.backgroundColor)))'},{timeout:20000});return parseSnapshot(data.data,employees,roles,colors);}
 async function write(snapshot,jobs){const requests=[],budgetPeriods=new Set(),assignmentPeriods=new Set(),pending=new Map(jobs.map(j=>[j.key,j]));
  const update=(row,col,value,fields)=>requests.push({updateCells:{range:{sheetId:SHEET_ID,startRowIndex:row,endRowIndex:row+1,startColumnIndex:col,endColumnIndex:col+1},rows:[{values:[value]}],fields}});
  for(const job of jobs){const item=snapshot.items.get(job.key);if(!item)throw Error('A target cell is not available in Google Sheet.');const ref=item.ref;if(job.type==='assignment'){
    if(ref.formula)throw Error('A target assignment contains a Sheet formula. Edit it in Google Sheet first.');const v=job.value;update(ref.row,ref.column,v?{userEnteredValue:{stringValue:v.code==='VAC'?'🏖️':v.code==='X'?'x':v.code==='GS'?'G':v.code},userEnteredFormat:{backgroundColor:color(v.color)}}:{},'userEnteredValue,userEnteredFormat.backgroundColor');assignmentPeriods.add(summary.periodStart(item.date));
   }else if(job.type==='code')update(ref.row,ref.column,{userEnteredValue:{stringValue:job.value}},'userEnteredValue');
   else if(job.type==='meta'){const value=job.value,note=ref.note.replace(marker,'')+'\n[MU_SCHEDULE_DATE]'+JSON.stringify({labels:value.labels});update(ref.row,ref.column,{note,userEnteredFormat:{backgroundColor:color(value.dateColor||'#ffffff')}},'note,userEnteredFormat.backgroundColor');}
   else if(job.type==='budget')budgetPeriods.add(summary.periodStart(job.date));
  }
  for(const start of assignmentPeriods){for(let i=0;i<7;i++){const c=snapshot.dates.get(summary.addDays(start,i));if(c===undefined||!snapshot.people.size)continue;const letter=column(c),refs='{'+[...snapshot.people.values()].map(r=>letter+(r+1)).join(';')+'}',count=code=>code==='GS'?`(COUNTIF(${refs},"G")+COUNTIF(${refs},"GS"))`:`COUNTIF(${refs},"${code}")`;for(const [code,row] of snapshot.coverageRows||[])update(row,c,{userEnteredValue:{formulaValue:'='+count(code)}},'userEnteredValue');update(snapshot.budgetRow-1,c,{userEnteredValue:{formulaValue:'=SUM('+summary.rows.filter(r=>r.hours).map(r=>count(r.codes[0])+'*'+r.hours).join(',')+')'}},'userEnteredValue');}const first=snapshot.dates.get(start),last=snapshot.dates.get(summary.addDays(start,6));if(first!==undefined&&last!==undefined)update(snapshot.budgetRow+1,first,{userEnteredValue:{formulaValue:`=SUM(${column(first)}${snapshot.budgetRow}:${column(last)}${snapshot.budgetRow})+40`}},'userEnteredValue');}
  for(const start of budgetPeriods){const cols=[];for(let i=0;i<7;i++){const date=summary.addDays(start,i),item=snapshot.items.get(key(date,'budget'));if(!item)throw Error('The Sheet needs all seven dates before this period budget can be synchronized.');const value=pending.get(item.key)?.value??item.value;cols.push(item.ref.column);update(snapshot.budgetRow,item.ref.column,{userEnteredValue:{numberValue:value}},'userEnteredValue');}update(snapshot.budgetRow,1,{userEnteredValue:{stringValue:'Daily Budget'}},'userEnteredValue');update(snapshot.periodBudgetRow,cols[0],{userEnteredValue:{formulaValue:`=SUM(${column(cols[0])}${snapshot.budgetRow+1}:${column(cols[6])}${snapshot.budgetRow+1})`}},'userEnteredValue');}
  if(requests.length)await sheets().spreadsheets.batchUpdate({spreadsheetId:SPREADSHEET_ID,requestBody:{requests}},{timeout:25000});
 }
 async function addMonth(snapshot,end){const start=summary.addDays(snapshot.lastDate,1),dates=[];for(let d=start;d<=end;d=summary.addDays(d,1))dates.push(d);if(!dates.length)return;const first=Math.max(...snapshot.dates.values())+1,last=first+dates.length,capacity=last+6,requests=[];if(capacity>snapshot.properties.columnCount)requests.push({appendDimension:{sheetId:SHEET_ID,dimension:'COLUMNS',length:capacity-snapshot.properties.columnCount}});
  requests.push({updateBorders:{range:{sheetId:SHEET_ID,startRowIndex:1,endRowIndex:70,startColumnIndex:first,endColumnIndex:last},innerVertical:{style:'SOLID',color:{red:.7,green:.7,blue:.7}},innerHorizontal:{style:'SOLID',color:{red:.7,green:.7,blue:.7}}}});
  for(const row of [1,40])requests.push({updateCells:{start:{sheetId:SHEET_ID,rowIndex:row,columnIndex:first},rows:[{values:dates.map(d=>({userEnteredValue:{numberValue:dateSerial(d)},userEnteredFormat:{numberFormat:{type:'DATE',pattern:'d'}}}))}],fields:'userEnteredValue,userEnteredFormat.numberFormat'}});
  for(const row of [2,41])requests.push({updateCells:{start:{sheetId:SHEET_ID,rowIndex:row,columnIndex:first},rows:[{values:dates.map(d=>({userEnteredValue:{stringValue:new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}).slice(0,2)}}))}],fields:'userEnteredValue'}});
  for(let i=0;i<dates.length;i++)if(i===0||dates[i].endsWith('-01'))requests.push({updateCells:{start:{sheetId:SHEET_ID,rowIndex:0,columnIndex:first+i},rows:[{values:[{userEnteredValue:{numberValue:dateSerial(dates[i])},userEnteredFormat:{numberFormat:{type:'DATE',pattern:'mmm yyyy'}}}]}],fields:'userEnteredValue,userEnteredFormat.numberFormat'}});
  requests.push({updateCells:{start:{sheetId:SHEET_ID,rowIndex:snapshot.budgetRow,columnIndex:first},rows:[{values:Array.from({length:dates.length+6},()=>({userEnteredValue:{numberValue:61}}))}],fields:'userEnteredValue'}});
  for(let i=0;i<dates.length;i++){const c=first+i,letter=column(c),refs='{'+[...snapshot.people.values()].map(r=>letter+(r+1)).join(';')+'}',terms=summary.rows.filter(r=>r.hours).map(r=>r.codes[0]==='GS'?`(COUNTIF(${refs},"G")+COUNTIF(${refs},"GS"))*${r.hours}`:`COUNTIF(${refs},"${r.codes[0]}")*${r.hours}`);if(snapshot.people.size){requests.push({updateCells:{start:{sheetId:SHEET_ID,rowIndex:snapshot.budgetRow-1,columnIndex:c},rows:[{values:[{userEnteredValue:{formulaValue:'=SUM('+terms.join(',')+')'}}]}],fields:'userEnteredValue'}});for(const [code,row] of snapshot.coverageRows||[])requests.push({updateCells:{start:{sheetId:SHEET_ID,rowIndex:row,columnIndex:c},rows:[{values:[{userEnteredValue:{formulaValue:code==='GS'?`=COUNTIF(${refs},"G")+COUNTIF(${refs},"GS")`:`=COUNTIF(${refs},"${code}")`}}]}],fields:'userEnteredValue'}});}
   if(new Date(dates[i]+'T12:00:00Z').getUTCDay()===5)for(const [row,formula] of [[snapshot.budgetRow+1,`=SUM(${letter}${snapshot.budgetRow}:${column(c+6)}${snapshot.budgetRow})+40`],[snapshot.periodBudgetRow,`=SUM(${letter}${snapshot.budgetRow+1}:${column(c+6)}${snapshot.budgetRow+1})`]])requests.push({updateCells:{start:{sheetId:SHEET_ID,rowIndex:row,columnIndex:c},rows:[{values:[{userEnteredValue:{formulaValue:formula}}]}],fields:'userEnteredValue'}});
  }
  for(let i=0;i<dates.length;i++)if(new Date(dates[i]+'T12:00:00Z').getUTCDay()===5)requests.push({updateBorders:{range:{sheetId:SHEET_ID,startRowIndex:0,endRowIndex:70,startColumnIndex:first+i,endColumnIndex:first+i+1},left:{style:'SOLID_MEDIUM',color:{red:1}}}});
  metadata=null;await sheets().spreadsheets.batchUpdate({spreadsheetId:SPREADSHEET_ID,requestBody:{requests}},{timeout:25000});
 }
 return {read,write,addMonth};
}
module.exports={createSheetsTransport,parseSnapshot,key,column,serialDate,dateSerial,SOURCE_URL};
