const path=require('node:path'),fs=require('node:fs');
const groups=require('./public/public/employee-account-groups'),positions=require('./public/public/employee-positions');
const {calculate,setInput}=require('./public/public/has-report-math');
const {field,exportWorkbook}=require('./hasReportLayout');
const {days,validateRows,applyExtraRows,moveValues}=require('./hasReportRows');
const {reportMonth,prepareCalendar}=require('./hasReportCalendar');
const templateDir=path.join(__dirname,'data','has-report-templates');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const unavailable=()=>fail('Reports are temporarily unavailable. Please retry later.',503);
function excel(){try{return require('exceljs');}catch(error){console.error('HAS report Excel dependency:',error);unavailable();}}
const DA_ROLES=['Lead','Supervisor','Senior Supervisor','Duty Manager','Business Manager','Airport Operations Manager','Airport Manager','Interim General Manager','General Manager','Regional Manager'];
function access(employee){const role=positions.normalize(employee?.position),main=employee&&!groups.isHeadquarter(employee);return {da:Boolean(main&&DA_ROLES.includes(role)),wwh:Boolean(main&&['Supervisor','Business Manager'].includes(role))};}
async function template(kind,month,scope,extraRows={}){
 const {year,name}=reportMonth(month);
 if(!['da','wwh'].includes(kind))fail('Unknown report type.',404);
 const cells={};
 const Excel=excel(),workbook=new Excel.Workbook();await workbook.xlsx.readFile(path.join(templateDir,kind+'-2026.xlsx'));const sheet=workbook.getWorksheet(name),columns=kind==='wwh'?29:14;
 prepareCalendar(sheet,kind,year);
 if(kind==='da')applyExtraRows(sheet,extraRows);else for(const row of [47,50,53])sheet.getCell('A'+row).value=row===47?'ADDITIONAL COMMENTS:':'COMMENTS:';
 // DA source contains hundreds of unused trailing rows; keep them in exports.
 let rows=sheet.rowCount;if(kind==='da'){rows=0;sheet.eachRow((row,n)=>{if(row.hasValues)rows=Math.max(rows,n);});}
 for(let r=1;r<=rows;r++)for(let c=1;c<=columns;c++){
  const cell=sheet.getCell(r,c);if(cell.isMerged&&cell.master!==cell)continue;
  let value=cell.value?.richText?cell.value.richText.map(t=>t.text).join(''):cell.value;
  if(value instanceof Date)value=value.toISOString().slice(0,10);
  const input=field(kind,r,c,cell.formula);if(kind==='da'&&r>=rows-2)input.editable=false;
  cells[cell.address]={value:cell.formula?(input.inputFormula?'='+cell.formula:''):value??'',...(cell.formula?{formula:cell.formula}:{}),...input,numFmt:input.type==='time'?'hh:mm':cell.numFmt||'',style:{background:cell.fill?.fgColor?.argb,color:cell.font?.color?.argb,bold:cell.font?.bold,align:cell.alignment?.horizontal}};
 }
 const accountCell=kind==='wwh'?'B1':'C4';cells[accountCell].value=scope.station+'/'+scope.account;cells[accountCell].editable=false;cells[accountCell].accountLocked=true;
 return {kind,month,rows,columns,cells,days:kind==='da'?days(sheet):[],extraRows,merges:sheet.model.merges,widths:Array.from({length:columns},(_,i)=>sheet.getColumn(i+1).width||12),hiddenColumns:Array.from({length:columns},(_,i)=>sheet.getColumn(i+1).hidden?i+1:0).filter(Boolean),heights:Array.from({length:rows},(_,i)=>sheet.getRow(i+1).height||20),sheetName:name,workbook};
}
function registerHasReports(app,{employees,profiles,authenticate,reportDb,liveHeartbeatMs}){
 let db,ownsDatabase=false;
 function database(){
  if(db)return db;
  let candidate,owned=false;
  try{
   const filename=process.env.HAS_REPORT_DB_PATH;
   if(reportDb)candidate=reportDb;
   else if(filename){if(filename!==':memory:')fs.mkdirSync(path.dirname(path.resolve(filename)),{recursive:true});candidate=new (require('better-sqlite3'))(filename);owned=true;}
   else candidate=employees.db;
   candidate.exec('CREATE TABLE IF NOT EXISTS has_reports(scope TEXT NOT NULL,kind TEXT NOT NULL,month TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(scope,kind,month))');
   db=candidate;ownsDatabase=owned;return db;
  }catch(error){if(owned&&candidate?.open)candidate.close();console.error('HAS report database initialization:',error);unavailable();}
 }
 app.use('/has-report-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.reportUser=await authenticate(req);next();}catch{res.status(401).json({error:'Sign in required.'});}});
 const context=user=>{const employee=profiles.linked(user);if(!employee)fail('Link your employee profile first.',403);return {employee,scope:groups.scope(employee),permissions:access(employee)};};
 const authorize=req=>{const ctx=context(req.reportUser);if(!['da','wwh'].includes(req.params.kind))fail('Unknown report type.',404);if(!ctx.permissions[req.params.kind])fail('Report access denied for your Main Account position.',403);return ctx;};
 const key=scope=>JSON.stringify([scope.station,scope.account]);
 const read=(scope,kind,month)=>{const row=database().prepare('SELECT data FROM has_reports WHERE scope=? AND kind=? AND month=?').get(key(scope),kind,month);const data=row?JSON.parse(row.data):{revision:0,values:{}};delete data.values[kind==='wwh'?'B1':'C4'];if(kind==='wwh')for(const [old,target] of [['A31','A32'],['A38','A39'],['A47','A48'],['A50','A51'],['A53','B54']]){const value=data.values[old];if(typeof value==='string'&&!data.values[target]&&!/^(?:ADDITIONAL\s+)?COMMENTS:\s*(?:NIL)?$/i.test(value.trim()))data.values[target]=value.replace(/^(?:ADDITIONAL\s+)?COMMENTS:\s*/i,'');}return data;};
 const live=require('./hasReportLive').createReportLive({context,read,heartbeatMs:liveHeartbeatMs});
 const handler=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){const infrastructure=['ENOENT','EACCES','EPERM','ENOTDIR'].includes(e.code)||String(e.code||'').startsWith('SQLITE_');if(infrastructure)console.error('HAS report request:',e);const status=infrastructure?503:e.status||400;if(status===503)res.set('Retry-After','30');res.status(status).json({error:infrastructure?'Reports are temporarily unavailable. Please retry later.':e.message});}};
 const build=async req=>{const ctx=authorize(req);reportMonth(req.params.month);const saved=read(ctx.scope,req.params.kind,req.params.month),model=await template(req.params.kind,req.params.month,ctx.scope,saved.extraRows);return {ctx,model,saved};};
 const apply=(model,values,stored=false)=>{if(!values||typeof values!=='object'||Array.isArray(values))fail('Invalid report values.');for(const [address,value] of Object.entries(values)){const cell=model.cells[address];if(!cell?.editable){if(stored)continue;fail('This template cell cannot be edited: '+address);}if(!['string','number'].includes(typeof value)||String(value).length>4000||typeof value==='number'&&!Number.isFinite(value))fail('Invalid cell value.');setInput(cell,value);}return model;};
 app.get('/has-report-api/context',handler(async(req,res)=>{const {scope,permissions}=context(req.reportUser);res.json({scope,permissions,canAdmin:permissions.wwh||require('./employees').ADMIN_EMAILS.has(String(req.reportUser.email||'').trim().toLowerCase())});}));
 const linkDA=async(model,scope)=>{
  if(model.kind!=='wwh')return null;
  const saved=read(scope,'da',model.month),source=await template('da',model.month,scope,saved.extraRows);apply(source,saved.values,true);const sourceResults=calculate(source.cells);
  for(let r=5;r<=10;r++){
   const range=String(model.cells['B'+r]?.value||'').match(/^(\d+)(?:\s*-\s*(\d+))?/);if(!range)continue;
   const from=+range[1],to=+(range[2]||range[1]);
   const dates=Object.entries(source.cells).filter(([a,c])=>/^A\d+$/.test(a)&&typeof c.value==='number'&&c.value>=1&&c.value<=31);
   const dayRow=day=>dates.find(([,c])=>c.value===day)?.[0].slice(1);
   const start=Number(dayRow(from)),end=dayRow(to+1)?Number(dayRow(to+1))-1:source.rows-3;
   if(!start)continue;
   for(const [target,column] of [['Z','L'],['AA','K']]){
    let value=0;for(let row=start;row<=end;row++){const address=column+row,cell=source.cells[address],n=cell?.formula?sourceResults[address]:cell?.value;if(typeof n==='string'&&n.startsWith('#')){value=n;break;}value+=Number(n)||0;}
    Object.assign(model.cells[target+r],{value,editable:false,linked:true,sourceFormula:`SUM('DA Source'!${column}${start}:${column}${end})`});
   }
  }
  model.daRevision=saved.revision;return source;
 };
 app.get('/has-report-api/:kind/:month',handler(async(req,res)=>{const {ctx,model,saved}=await build(req);apply(model,saved.values,true);await linkDA(model,ctx.scope);const {workbook,...view}=model;res.json({...view,...saved,scope:ctx.scope,calculated:calculate(model.cells)});}));
 const write=(ctx,model,user,body,action='Edited')=>{const saved=database().transaction(()=>{
  const latest=read(ctx.scope,model.kind,model.month);if((body.layoutRevision||0)!==(latest.layoutRevision||0))fail('Daily rows changed. Reload the report before continuing.',409);apply(model,latest.values,true);
  const entries=Object.entries(body.values||{});if(!entries.length)fail('No cell changes to save.');
  if(body.revision!==latest.revision){
   if(!body.baseValues||entries.some(([a])=>!Object.hasOwn(body.baseValues,a)||body.baseValues[a]!==model.cells[a]?.value))fail('Another editor changed these cells. Your changes have not been overwritten. Reload to review the latest report.',409);
  }
  apply(model,body.values);calculate(model.cells);
  const at=new Date().toISOString(),name=ctx.employee.nickname||ctx.employee.name||ctx.employee.position;
  const history=[...(latest.history||[]),{at,name,action,cells:entries.map(([a])=>a)}].slice(-30);
  const data={revision:latest.revision+1,layoutRevision:latest.layoutRevision||0,extraRows:latest.extraRows||{},values:{...latest.values,...body.values},updatedAt:at,updatedBy:name,history};
  db.prepare('INSERT OR REPLACE INTO has_reports VALUES(?,?,?,?)').run(key(ctx.scope),model.kind,model.month,JSON.stringify(data));return data;
 })();live.publish(ctx.scope,model.kind,model.month);return saved;};
 app.post('/has-report-api/:kind/:month',handler(async(req,res)=>{const {ctx,model}=await build(req);res.json(write(ctx,model,req.reportUser,req.body));}));
 app.post('/has-report-api/:kind/:month/rows',handler(async(req,res)=>{
  const {ctx,model}=await build(req);if(model.kind!=='da')fail('Rows can only be added to DA.');const day=Number(req.body.day),block=model.days.find(d=>d.day===day);if(!block)fail('Choose a date in this month.');
  const saved=database().transaction(()=>{const latest=read(ctx.scope,'da',model.month);if(req.body.revision!==latest.revision||(req.body.layoutRevision||0)!==(latest.layoutRevision||0))fail('Report changed. Wait for the latest version before adding a row.',409);const extraRows=validateRows({...latest.extraRows,[day]:(latest.extraRows?.[day]||0)+1}),at=new Date().toISOString(),name=ctx.employee.nickname||ctx.employee.name||ctx.employee.position;
   const data={...latest,revision:latest.revision+1,layoutRevision:(latest.layoutRevision||0)+1,extraRows,values:moveValues(latest.values,block.end+1,1,model),updatedAt:at,updatedBy:name,history:[...(latest.history||[]),{at,name,action:'Added row to day '+day,cells:['A'+block.start]}].slice(-30)};database().prepare('INSERT OR REPLACE INTO has_reports VALUES(?,?,?,?)').run(key(ctx.scope),'da',model.month,JSON.stringify(data));return data;
  })();live.publish(ctx.scope,'da',model.month);res.json({revision:saved.revision,layoutRevision:saved.layoutRevision,extraRows:saved.extraRows});
 }));
 app.get('/has-report-api/:kind/:month/updates',handler(async(req,res)=>{const ctx=authorize(req);const saved=read(ctx.scope,req.params.kind,req.params.month);res.json({scope:ctx.scope,revision:saved.revision,updatedBy:saved.updatedBy,daRevision:req.params.kind==='wwh'?read(ctx.scope,'da',req.params.month).revision:0});}));
 app.get('/has-report-api/:kind/:month/stream',handler(async(req,res)=>{const ctx=authorize(req);reportMonth(req.params.month);live.subscribe(req,res,ctx);}));
 app.post('/has-report-api/:kind/:month/import',handler(async(req,res)=>{
  const {ctx,model}=await build(req);if(typeof req.body.file!=='string'||req.body.file.length>14000000)fail('Choose an Excel file up to 10 MB.');
  const Excel=excel(),workbook=new Excel.Workbook();await workbook.xlsx.load(Buffer.from(req.body.file,'base64'));const sheet=workbook.getWorksheet(model.sheetName);if(!sheet)fail('The workbook has no sheet for the selected month.');
  const expected=req.params.kind==='wwh'?'WEEK':'DATE';if(String(sheet.getCell(req.params.kind==='wwh'?'A3':'A5').text).trim()!==expected)fail('Choose the matching DA or WWH workbook.');
  const values={};for(const [address,cell] of Object.entries(model.cells))if(cell.editable){const source=sheet.getCell(address);let value=source.value;if(source.formula){if(cell.formulaAllowed)value='='+source.formula;else value=source.result??'';}if(value instanceof Date)value=(value.getTime()-Date.UTC(1899,11,30))/86400000;if(value?.richText)value=value.richText.map(t=>t.text).join('');if(value==null)value='';if(['string','number'].includes(typeof value))values[address]=value;}
  res.json(write(ctx,model,req.reportUser,{revision:req.body.revision,layoutRevision:req.body.layoutRevision||0,values},'Imported Excel'));
 }));
 app.get('/has-report-api/:kind/:month/export',handler(async(req,res)=>{
  const {ctx,model}=await build(req),year=model.month.slice(0,4),filename=`${model.kind.toUpperCase()}_${ctx.scope.station}_${ctx.scope.account}_${year}`;
  // The originals are annual workbooks. Populate every monthly tab from this
  // Main Account's shared records, including the selected month's live totals.
  for(let m=1;m<=12;m++){
   const month=year+'-'+String(m).padStart(2,'0'),stored=read(ctx.scope,model.kind,month),current=month===model.month?model:await template(model.kind,month,ctx.scope,stored.extraRows);
   apply(current,stored.values,true);const source=await linkDA(current,ctx.scope),results=calculate(current.cells),sheet=model.workbook.getWorksheet(current.sheetName);if(current!==model){prepareCalendar(sheet,model.kind,+year);if(model.kind==='da')applyExtraRows(sheet,stored.extraRows);}
   if(model.kind==='wwh')for(const row of [47,50,53])sheet.getCell('A'+row).value=row===47?'ADDITIONAL COMMENTS:':'COMMENTS:';
   const sourceName=month===model.month?'DA Source':'DA Source '+current.sheetName;
   if(source){const data=model.workbook.addWorksheet(sourceName,{state:'hidden'}),computed=calculate(source.cells);for(const [address,cell] of Object.entries(source.cells))data.getCell(address).value=cell.formula?{formula:cell.formula,result:typeof computed[address]==='string'?{error:computed[address]}:computed[address]}:cell.value===''?null:cell.value;}
   for(const [address,cell] of Object.entries(current.cells)){if(cell.sourceFormula)sheet.getCell(address).value={formula:cell.sourceFormula.replace("'DA Source'","'"+sourceName+"'"),result:typeof cell.value==='string'?{error:cell.value}:cell.value};else if(cell.formula)sheet.getCell(address).value={formula:cell.formula,result:typeof results[address]==='string'?{error:results[address]}:results[address]};else if(cell.editable||cell.accountLocked)sheet.getCell(address).value=cell.value===''?null:cell.value;if(cell.type==='time')sheet.getCell(address).numFmt='hh:mm';}
   if(model.kind==='da')for(const day of current.days)for(let row=day.start;row<=day.end;row++)for(let column=1;column<=13;column++)sheet.getCell(row,column).fill={type:'pattern',pattern:'solid',fgColor:{argb:day.day%2?'FFFFFFFF':'FFEDF5FF'}};
   if(model.kind==='da'){const summary=model.workbook.getWorksheet('Summary Page'),value=results['M'+current.rows];summary.getCell(m,2).value={formula:current.sheetName+'!M'+current.rows,result:typeof value==='string'?{error:value}:value};}
  }
  model.workbook.calcProperties.fullCalcOnLoad=true;
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(filename+'.xlsx').send(await exportWorkbook(model.workbook));
 }));
 return {context,close(){live.close();if(ownsDatabase&&db?.open)db.close();db=undefined;ownsDatabase=false;}};
}
module.exports={access,template,registerHasReports};
