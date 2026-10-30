const path=require('node:path'),fs=require('node:fs');
const groups=require('./public/public/employee-account-groups'),positions=require('./public/public/employee-positions');
const {calculate,setInput,isError}=require('./public/public/has-report-math');
const {field,exportWorkbook}=require('./hasReportLayout');
const {days,validateRows,applyExtraRows,moveValues}=require('./hasReportRows');
const {reportMonth,prepareCalendar}=require('./hasReportCalendar');
const {flightDelays}=require('./hasReportDelays');
const recharge=require('./hasRecharge');
const forms=require('./hasReportForms');
const wordForms=require('./hasWordReports');
const templateDir=path.join(__dirname,'data','has-report-templates');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const unavailable=()=>fail('Reports are temporarily unavailable. Please retry later.',503);
function excel(){try{return require('exceljs');}catch(error){console.error('HAS report Excel dependency:',error);unavailable();}}
const DA_ROLES=['Lead','Supervisor','Senior Supervisor','Duty Manager','Business Manager','Airport Operations Manager','Airport Manager','Interim General Manager','General Manager','Regional Manager'];
function access(employee){const role=positions.normalize(employee?.position),main=employee&&!groups.isHeadquarter(employee);return {da:Boolean(main&&DA_ROLES.includes(role)),wwh:Boolean(main&&['Supervisor','Business Manager'].includes(role))};}
function canDashboard(employee){return Boolean(employee&&!groups.isHeadquarter(employee)&&DA_ROLES.filter(role=>role!=='Lead').includes(positions.normalize(employee.position)));}
function monthFormat(cell,name){cell.style={...cell.style,numFmt:'"'+name.toUpperCase()+'"-yy'};}
async function template(kind,month,scope,extraRows={}){
 const {year,name}=reportMonth(month);
 if(forms.kinds.includes(kind))return forms.template(kind,month,scope,extraRows);
 if(!['da','wwh'].includes(kind))fail('Unknown report type.',404);
 const cells={},wheelchair=kind==='da'&&scope.station==='LAX'&&scope.account==='MU';
 const Excel=excel(),workbook=new Excel.Workbook();await workbook.xlsx.readFile(path.join(templateDir,kind+'-2026.xlsx'));const sheet=workbook.getWorksheet(name),columns=kind==='wwh'?29:14;
 prepareCalendar(sheet,kind,year);if(kind==='da')monthFormat(sheet.getCell('I4'),name);
 if(kind==='da')applyExtraRows(sheet,extraRows);else for(const row of [47,50,53])sheet.getCell('A'+row).value=row===47?'ADDITIONAL COMMENTS:':'COMMENTS:';
 if(kind==='wwh')for(const [address,label] of Object.entries({T4:'Delays (#)',U4:'Delay (hrs)',V4:'Delays (#)',W4:'CNXL FLT (#)',X4:'CNXL FLT (#)'}))sheet.getCell(address).value=label;
 // DA source contains hundreds of unused trailing rows; keep them in exports.
 let rows=sheet.rowCount;if(kind==='da')rows=days(sheet).at(-1).end+3;
 for(let r=1;r<=rows;r++)for(let c=1;c<=columns;c++){
  const cell=sheet.getCell(r,c);if(cell.isMerged&&cell.master!==cell)continue;
  let value=cell.value?.richText?cell.value.richText.map(t=>t.text).join(''):cell.value;
  if(value instanceof Date)value=value.toISOString().slice(0,10);
  const input=field(kind,r,c,cell.formula);if(kind==='da'&&r>=6&&c>=11&&c<=14&&!String(cell.numFmt||'').includes('%'))input.unit='count';if(kind==='da'&&r>=rows-2)input.editable=false;
  cells[cell.address]={value:cell.formula?(input.inputFormula?'='+cell.formula:''):value??'',...(cell.formula?{formula:cell.formula}:{}),...input,monthLabel:kind==='da'&&r===4&&c===9,numFmt:input.type==='time'?'hh:mm':input.unit==='count'?'0':input.unit==='hours'?'0.00':cell.numFmt||'',style:{background:cell.fill?.fgColor?.argb,color:cell.font?.color?.argb,bold:cell.font?.bold,align:cell.alignment?.horizontal}};
 }
 // Browser-only cells use the shared report storage but never enter Excel exports.
 if(wheelchair)for(let r=1;r<=rows;r++)for(const column of ['O','P'])cells[column+r]={value:r===4&&column==='O'?'WHEELCHAIR':r===5?(column==='O'?'Arrival':'Departure'):'',editable:r>=6&&r<rows-2,type:'text',formulaAllowed:false,webOnly:true,style:{align:'center',bold:r===4}};
 if(kind==='wwh')for(let r=5;r<=10;r++)for(const c of ['I','N','T','U','V','W','X'])if(cells[c+r]&&!cells[c+r].formula&&(cells[c+r].value===''||cells[c+r].value==null))cells[c+r].value=0;
 const accountCell=kind==='wwh'?'B1':'C4';cells[accountCell].value=scope.station+'/'+scope.account;cells[accountCell].editable=false;cells[accountCell].accountLocked=true;
 return {kind,month,rows,columns:wheelchair?16:columns,cells,days:kind==='da'?days(sheet):[],extraRows,merges:wheelchair?[...sheet.model.merges,'O4:P4']:sheet.model.merges,widths:Array.from({length:columns},(_,i)=>sheet.getColumn(i+1).width||12).concat(wheelchair?[12,12]:[]),hiddenColumns:Array.from({length:columns},(_,i)=>sheet.getColumn(i+1).hidden?i+1:0).filter(Boolean),heights:Array.from({length:rows},(_,i)=>sheet.getRow(i+1).height||20),sheetName:name,workbook};
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
 app.use('/has-report-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.reportUser={...await authenticate(req),workspaceScope:req.get('X-Workspace-Account')||null};next();}catch{res.status(401).json({error:'Sign in required.'});}});
 const context=user=>{const employee=require('./workspaceScope').scopeEmployee(profiles.linked(user),user.workspaceScope);if(!employee)fail('Link your employee profile first.',403);return {employee,scope:groups.scope(employee),permissions:{...access(employee),terrific:canDashboard(employee),expense:canDashboard(employee)}};};
 const authorize=req=>{const ctx=context(req.reportUser);if(!['da','wwh',...forms.kinds].includes(req.params.kind))fail('Unknown report type.',404);if(!ctx.permissions[req.params.kind])fail('Report access denied for your Main Account position.',403);return ctx;};
 const key=scope=>JSON.stringify([scope.station,scope.account]);
 const read=(scope,kind,month)=>{const row=database().prepare('SELECT data FROM has_reports WHERE scope=? AND kind=? AND month=?').get(key(scope),kind,month);const data=row?JSON.parse(row.data):{revision:0,values:{}};if(['da','wwh'].includes(kind))delete data.values[kind==='wwh'?'B1':'C4'];if(kind==='wwh')for(const [old,target] of [['A31','A32'],['A38','A39'],['A47','A48'],['A50','A51'],['A53','B54']]){const value=data.values[old];if(typeof value==='string'&&!data.values[target]&&!/^(?:ADDITIONAL\s+)?COMMENTS:\s*(?:NIL)?$/i.test(value.trim()))data.values[target]=value.replace(/^(?:ADDITIONAL\s+)?COMMENTS:\s*/i,'');}return data;};
 const live=require('./hasReportLive').createReportLive({context,read,heartbeatMs:liveHeartbeatMs});
 const handler=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){const infrastructure=['ENOENT','EACCES','EPERM','ENOTDIR'].includes(e.code)||String(e.code||'').startsWith('SQLITE_');if(infrastructure)console.error('HAS report request:',e);const status=infrastructure?503:e.status||400;if(status===503)res.set('Retry-After','30');res.status(status).json({error:infrastructure?'Reports are temporarily unavailable. Please retry later.':e.message});}};
 const build=async req=>{const ctx=authorize(req);reportMonth(req.params.month);const saved=read(ctx.scope,req.params.kind,req.params.month),model=await template(req.params.kind,req.params.month,ctx.scope,saved.extraRows);return {ctx,model,saved};};
 const apply=(model,values,stored=false)=>{if(!values||typeof values!=='object'||Array.isArray(values))fail('Invalid report values.');for(const [address,value] of Object.entries(values)){const cell=model.cells[address];if(!cell?.editable){if(stored)continue;fail('This template cell cannot be edited: '+address);}if(!['string','number'].includes(typeof value)||String(value).length>4000||typeof value==='number'&&!Number.isFinite(value))fail('Invalid cell value.');if(cell.webOnly&&value!==''&&(!Number.isSafeInteger(Number(value))||Number(value)<0))fail('Wheelchair counts must be non-negative whole numbers.');setInput(cell,value);}return model;};
 app.get('/has-report-api/context',handler(async(req,res)=>{const {employee,scope,permissions}=context(req.reportUser),supervisor=canDashboard(employee);res.json({scope,permissions:{...permissions,rechargeable:recharge.allowed(employee),...Object.fromEntries(wordForms.kinds.map(kind=>[kind,supervisor]))},canChecklist:require('./hasChecklists').allowed(employee),canDashboard:supervisor,canAdmin:permissions.wwh||require('./employees').ADMIN_EMAILS.has(String(req.reportUser.email||'').trim().toLowerCase())});}));
 wordForms.register(app,{context,database,read,key,handler,allowed:canDashboard});
 require('./hasChecklists').register(app,{context,handler,supervisor:canDashboard,database,read,key});
 const linkDA=async(model,scope)=>{
  if(model.kind!=='wwh')return null;
  for(let r=5;r<=10;r++)for(const c of ['I','N','T','U','V','W','X'])if(model.cells[c+r]&&!model.cells[c+r].formula&&model.cells[c+r].value==='')model.cells[c+r].value=0;
  recharge.link(model,read(scope,'rechargeable',model.month));
  const saved=read(scope,'da',model.month),source=await template('da',model.month,scope,saved.extraRows);apply(source,saved.values,true);const sourceResults=calculate(source.cells);
  for(let r=5;r<=10;r++){
   const range=String(model.cells['B'+r]?.value||'').match(/^(\d+)(?:\s*-\s*(\d+))?/);if(!range)continue;
   const from=+range[1],to=+(range[2]||range[1]);
   const start=source.days.find(day=>day.day===from)?.start,end=source.days.find(day=>day.day===to)?.end;
   if(!start)continue;
   for(const [target,column] of [['Z','L'],['AA','K']]){
    let value=0;for(let row=start;row<=end;row++){const address=column+row,cell=source.cells[address],n=cell?.formula?sourceResults[address]:cell?.value;if(isError(n)){value=n;break;}value+=Number(n)||0;}
    Object.assign(model.cells[target+r],{value,editable:false,linked:true,sourceFormula:`SUM('DA Source'!${column}${start}:${column}${end})`});
   }
  }
  model.daRevision=saved.revision;return source;
 };
 app.get('/has-report-api/dashboard/:year',handler(async(req,res)=>{
  const ctx=context(req.reportUser);if(!canDashboard(ctx.employee))fail('Dashboard access requires Supervisor or above in your Main Account.',403);
  if(!/^\d{4}$/.test(req.params.year)||+req.params.year<2026)fail('Select a year from 2026 onward.');
  const year=+req.params.year,months=[];
  for(let m=1;m<=12;m++){
   const month=year+'-'+String(m).padStart(2,'0'),wwh=read(ctx.scope,'wwh',month),da=read(ctx.scope,'da',month);
   const row={month,hasDA:da.revision>0,hasWWH:wwh.revision>0||recharge.isLinked(read(ctx.scope,'rechargeable',month)),updatedAt:[da.updatedAt,wwh.updatedAt].filter(Boolean).sort().at(-1)||null};
   const metrics=['budgetHours','actualHours','rechargeHours','balanceHours','netActualHours','flights','pax'];for(const metric of metrics)row[metric]=null;
   row.rechargeBreakdown=null;row.flightDelays=null;row.state='not-started';row.errors=[];
   if(!row.hasDA&&!row.hasWWH){months.push(row);continue;}
   const model=await template('wwh',month,ctx.scope);apply(model,wwh.values,true);const source=await linkDA(model,ctx.scope),calculated=calculate(model.cells);if(row.hasDA)row.flightDelays=flightDelays(source);
   const numeric=address=>{const cell=model.cells[address],value=cell?.formula?calculated[address]:cell?.value;if(typeof value==='number'&&Number.isFinite(value))return value;row.errors.push(address);return null;};
   if(row.hasDA){row.flights=numeric('Z11');row.pax=numeric('AA11');}
   if(row.hasWWH){
    row.budgetHours=numeric('D11');row.actualHours=numeric('E11');row.rechargeHours=numeric('J11');
    row.rechargeBreakdown={regular:numeric('K11'),overtime:numeric('L11'),doubleTime:numeric('M11'),training:numeric('N11')};
    if(row.rechargeHours!==null&&row.actualHours!==null)row.netActualHours=row.actualHours-row.rechargeHours;
    if(row.budgetHours!==null&&row.netActualHours!==null)row.balanceHours=row.budgetHours-row.netActualHours;
    row.state=row.errors.length?'calculation-error':!row.hasDA?'incomplete':row.balanceHours>0.005?'surplus':row.balanceHours< -0.005?'overrun':'balanced';
   }else row.state='incomplete';
   if(!row.hasDA){row.balanceHours=null;row.budgetHours=null;}
   months.push(row);
  }
  const latest=context(req.reportUser);if(!canDashboard(latest.employee)||key(latest.scope)!==key(ctx.scope))fail('Your Main Account access changed. Reload the page.',403);
  res.json({year,scope:ctx.scope,months,generatedAt:new Date().toISOString(),basis:'budgetHours + rechargeHours - actualHours'});
 }));
 recharge.register(app,{context,database,read,key,handler,template,live});
 app.get('/has-report-api/:kind/:month',handler(async(req,res)=>{const {ctx,model,saved}=await build(req);apply(model,saved.values,true);await linkDA(model,ctx.scope);const {workbook,...view}=model;res.json({...view,...saved,scope:ctx.scope,calculated:calculate(model.cells)});}));
 const write=(ctx,model,user,body,action='Edited')=>{const saved=database().transaction(()=>{
  const latest=read(ctx.scope,model.kind,model.month);if((body.layoutRevision||0)!==(latest.layoutRevision||0))fail('Daily rows changed. Reload the report before continuing.',409);apply(model,latest.values,true);
  if(model.kind==='wwh')recharge.link(model,read(ctx.scope,'rechargeable',model.month));
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
  const {ctx,model}=await build(req);const delta=req.body.delta??1;if(delta!==1&&delta!==-1)fail('Choose add or remove row.');
  if(model.kind==='terrific'){
   const saved=database().transaction(()=>{const latest=read(ctx.scope,'terrific',model.month);if(req.body.revision!==latest.revision||(req.body.layoutRevision||0)!==(latest.layoutRevision||0))fail('Report rows changed. Reload before changing rows.',409);
    const count=(latest.extraRows?.terrificRows??13)+delta;if(count<1||count>200)fail('Terrific Ten supports 1 to 200 rows.');apply(model,latest.values,true);
    if(delta<0&&req.body.confirmRemoval!==true&&Object.entries(model.cells).some(([address,cell])=>Number(address.match(/\d+$/)[0])===model.rows&&cell.editable&&cell.value!==''&&cell.value!=null))fail('This row contains data. Confirm removal before deleting it.',409);
    const at=new Date().toISOString(),name=ctx.employee.nickname||ctx.employee.name||ctx.employee.position,data={...latest,revision:latest.revision+1,layoutRevision:(latest.layoutRevision||0)+1,extraRows:{...latest.extraRows,terrificRows:count},values:Object.fromEntries(Object.entries(latest.values).filter(([address])=>Number(address.match(/\d+$/)[0])<=count+2)),updatedAt:at,updatedBy:name,history:[...(latest.history||[]),{at,name,action:delta>0?'Added Terrific Ten row':'Removed Terrific Ten row',cells:['A'+(delta>0?model.rows+1:model.rows)]}].slice(-30)};
    database().prepare('INSERT OR REPLACE INTO has_reports VALUES(?,?,?,?)').run(key(ctx.scope),'terrific',model.month,JSON.stringify(data));return data;
   })();live.publish(ctx.scope,'terrific',model.month);return res.json({revision:saved.revision,layoutRevision:saved.layoutRevision,extraRows:saved.extraRows});
  }
  if(model.kind!=='da')fail('Rows can only be changed in DA or Terrific Ten.');const day=Number(req.body.day),block=model.days.find(d=>d.day===day);if(!block)fail('Choose a date in this month.');
  const saved=database().transaction(()=>{const latest=read(ctx.scope,'da',model.month);if(req.body.revision!==latest.revision||(req.body.layoutRevision||0)!==(latest.layoutRevision||0))fail('Report changed. Wait for the latest version before changing rows.',409);if(delta<0&&!(latest.extraRows?.[day]>0))fail('Only added rows can be removed.');apply(model,latest.values,true);if(delta<0&&req.body.confirmRemoval!==true&&Object.entries(model.cells).some(([address,cell])=>Number(address.match(/\d+$/)[0])===block.end&&cell.editable&&cell.value!==''&&cell.value!=null))fail('This row contains data. Confirm removal before deleting it.',409);const extraRows=validateRows({...latest.extraRows,[day]:(latest.extraRows?.[day]||0)+delta}),at=new Date().toISOString(),name=ctx.employee.nickname||ctx.employee.name||ctx.employee.position;
   const data={...latest,revision:latest.revision+1,layoutRevision:(latest.layoutRevision||0)+1,extraRows,values:moveValues(latest.values,block.end+(delta>0?1:0),delta,model),updatedAt:at,updatedBy:name,history:[...(latest.history||[]),{at,name,action:(delta>0?'Added row to day ':'Removed row from day ')+day,cells:['A'+block.start]}].slice(-30)};database().prepare('INSERT OR REPLACE INTO has_reports VALUES(?,?,?,?)').run(key(ctx.scope),'da',model.month,JSON.stringify(data));return data;
  })();live.publish(ctx.scope,'da',model.month);res.json({revision:saved.revision,layoutRevision:saved.layoutRevision,extraRows:saved.extraRows});
 }));
 app.get('/has-report-api/:kind/:month/updates',handler(async(req,res)=>{const ctx=authorize(req);const saved=read(ctx.scope,req.params.kind,req.params.month);res.json({scope:ctx.scope,revision:saved.revision,updatedBy:saved.updatedBy,daRevision:req.params.kind==='wwh'?read(ctx.scope,'da',req.params.month).revision:0,rechargeRevision:req.params.kind==='wwh'?read(ctx.scope,'rechargeable',req.params.month).revision:0});}));
 app.get('/has-report-api/:kind/:month/stream',handler(async(req,res)=>{const ctx=authorize(req);reportMonth(req.params.month);live.subscribe(req,res,ctx);}));
 app.post('/has-report-api/:kind/:month/import',handler(async(req,res)=>{
  const {ctx,model}=await build(req);if(forms.kinds.includes(model.kind))fail('Excel import is unavailable for this form.');if(model.kind==='wwh')recharge.link(model,read(ctx.scope,'rechargeable',model.month));if(typeof req.body.file!=='string'||req.body.file.length>14000000)fail('Choose an Excel file up to 10 MB.');
  const Excel=excel(),workbook=new Excel.Workbook();await workbook.xlsx.load(Buffer.from(req.body.file,'base64'));const sheet=workbook.getWorksheet(model.sheetName);if(!sheet)fail('The workbook has no sheet for the selected month.');
  const expected=req.params.kind==='wwh'?'WEEK':'DATE';if(String(sheet.getCell(req.params.kind==='wwh'?'A3':'A5').text).trim()!==expected)fail('Choose the matching DA or WWH workbook.');
  const values={};for(const [address,cell] of Object.entries(model.cells))if(cell.editable&&!cell.webOnly){const source=sheet.getCell(address);let value=source.value;if(source.formula){if(cell.formulaAllowed)value='='+source.formula;else value=source.result??'';}if(value instanceof Date)value=(value.getTime()-Date.UTC(1899,11,30))/86400000;if(value?.richText)value=value.richText.map(t=>t.text).join('');if(value==null)value='';if(['string','number'].includes(typeof value))values[address]=value;}
  res.json(write(ctx,model,req.reportUser,{revision:req.body.revision,layoutRevision:req.body.layoutRevision||0,values},'Imported Excel'));
 }));
 app.get('/has-report-api/:kind/:month/export',handler(async(req,res)=>{
  const {ctx,model}=await build(req),year=model.month.slice(0,4),filename=`${model.kind.toUpperCase()}_${ctx.scope.station}_${ctx.scope.account}_${year}`;
  if(forms.kinds.includes(model.kind)){apply(model,read(ctx.scope,model.kind,model.month).values,true);return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(model.kind+'_'+ctx.scope.station+'_'+ctx.scope.account+'_'+model.month+'.xlsx').send(await forms.exportForm(model));}
  // The originals are annual workbooks. Populate every monthly tab from this
  // Main Account's shared records, including the selected month's live totals.
  for(let m=1;m<=12;m++){
   const month=year+'-'+String(m).padStart(2,'0'),stored=read(ctx.scope,model.kind,month),current=month===model.month?model:await template(model.kind,month,ctx.scope,stored.extraRows);
   apply(current,stored.values,true);const source=await linkDA(current,ctx.scope),results=calculate(current.cells),sheet=model.workbook.getWorksheet(current.sheetName);if(current!==model){prepareCalendar(sheet,model.kind,+year);if(model.kind==='da')applyExtraRows(sheet,stored.extraRows);}
   if(model.kind==='wwh')for(const row of [47,50,53])sheet.getCell('A'+row).value=row===47?'ADDITIONAL COMMENTS:':'COMMENTS:';
   const sourceName=month===model.month?'DA Source':'DA Source '+current.sheetName;
   if(source){const data=model.workbook.addWorksheet(sourceName,{state:'hidden'}),computed=calculate(source.cells);for(const [address,cell] of Object.entries(source.cells))if(!cell.webOnly)data.getCell(address).value=cell.formula?{formula:cell.formula,result:typeof computed[address]==='string'?{error:computed[address]}:computed[address]}:cell.value===''?null:cell.value;}
   // Template cells share style objects; clone before changing number formats.
   for(const [address,cell] of Object.entries(current.cells)){if(cell.webOnly)continue;if(cell.sourceFormula)sheet.getCell(address).value={formula:cell.sourceFormula.replace("'DA Source'","'"+sourceName+"'"),result:typeof cell.value==='string'?{error:cell.value}:cell.value};else if(cell.formula)sheet.getCell(address).value={formula:cell.formula,result:typeof results[address]==='string'?{error:results[address]}:results[address]};else if(cell.linked||cell.editable||cell.accountLocked||model.kind==='wwh'&&['T4','U4','V4','W4','X4'].includes(address))sheet.getCell(address).value=cell.value===''?null:cell.value;if(cell.unit)sheet.getCell(address).style={...sheet.getCell(address).style,numFmt:cell.numFmt};if(cell.type==='time')sheet.getCell(address).style={...sheet.getCell(address).style,numFmt:'hh:mm'};if(cell.monthLabel)monthFormat(sheet.getCell(address),current.sheetName);}
   // Cells in different dates can share template styles; band each cell independently.
   if(model.kind==='da')for(const day of current.days)for(let row=day.start;row<=day.end;row++)for(let column=1;column<=13;column++){const cell=sheet.getCell(row,column);cell.style={...cell.style,fill:{type:'pattern',pattern:'solid',fgColor:{argb:day.day%2?'FFFFFFFF':'FFEDF5FF'}}};}
   if(model.kind==='da'){const summary=model.workbook.getWorksheet('Summary Page'),value=results['M'+current.rows];summary.getCell(m,2).value={formula:current.sheetName+'!M'+current.rows,result:typeof value==='string'?{error:value}:value};}
  }
  model.workbook.calcProperties.fullCalcOnLoad=true;
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(filename+'.xlsx').send(await exportWorkbook(model.workbook));
 }));
 const wheelchairMailer=require('./hasWheelchairMail').createMailer({database,read,template});
 return {context,startWheelchairMail:()=>wheelchairMailer.start(),close(){wheelchairMailer.close();live.close();if(ownsDatabase&&db?.open)db.close();db=undefined;ownsDatabase=false;}};
}
module.exports={access,template,registerHasReports};
