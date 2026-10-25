const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {reportMonth}=require('./hasReportCalendar');
const detailFields=['B9','F9','I9','M9','P9','S9','B10','F10','I10','M10','P10','S10','B12','F12','I12','M12','P12','S12','B13','F13','I13','M13','P13','S13','A17','A18','A19'];
const categories=['ST','T5','DT','TRAIN'],roles=['Agent','Supervisor','Duty Manager'];
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const allowed=e=>Boolean(e&&!require('./public/public/employee-account-groups').isHeadquarter(e)&&['Supervisor','Senior Supervisor','Duty Manager','Business Manager','Airport Operations Manager','Airport Manager','Interim General Manager','General Manager','Regional Manager'].includes(require('./public/public/employee-positions').normalize(e.position)));
function validate(input,month,periods){
 const {year,month:m}=reportMonth(month),last=new Date(Date.UTC(year,m,0)).getUTCDate();
 const text=(v,max=500)=>{if(typeof v!=='string'||v.length>max)fail('Invalid charge text.');return v.trim();};
 const day=Number(input.day);if(!Number.isInteger(day)||day<1||day>last)fail('Choose a date in this month.');
 const reason=text(input.reason,4000),flight=text(input.flight,100);if(!reason)fail('Enter a recharge reason.');
 if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>444)fail('Enter charge hours on the daily form.');
 const lines=input.lines.map((l,index)=>{const name=text(l.name,120),role=l.role,category=l.category,hours=Number(l.hours);if(!name||!roles.includes(role)||!categories.includes(category)||!Number.isFinite(hours)||hours<=0||hours>10000||Math.abs(hours*100-Math.round(hours*100))>1e-7)fail('Enter a name, role, category and positive hours (up to two decimals).');const row=l.row==null?23+index:Number(l.row);if((!Number.isInteger(row)||row<23||row>59))fail('Invalid charge row.');return {name,role,category,hours,row,reason:typeof l.reason==='string'?text(l.reason,500):''};});
 const seen=new Set(),names={};for(const l of lines){const k=[l.row,l.role,l.category].join(':');if(seen.has(k)||names[l.row]&&names[l.row]!==l.name)fail('Each charge cell must be unique and each row must have one name.');seen.add(k);names[l.row]=l.name;}
 const monthly=input.monthly===true,allocations={};
 if(monthly){if(day!==last)fail('Monthly charges must appear on the last day.');for(const c of categories){const values=input.allocations?.[c];if(!Array.isArray(values)||values.length!==periods.length||values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||Math.abs(v*100-Math.round(v*100))>1e-7))fail('Enter allocations for every WWH period and category.');const total=lines.filter(l=>l.category===c).reduce((s,l)=>s+l.hours,0);if(Math.abs(values.reduce((a,b)=>a+b,0)-total)>0.005)fail(c+' allocations must equal charge hours.');allocations[c]=values;}}
 const fields={};for(const a of detailFields)if(input.fields?.[a]!=null)fields[a]=text(input.fields[a],500);
 return {day,reason,flight,lines,monthly,allocations,fields};
}
function periods(model){return Array.from({length:6},(_,i)=>({row:i+5,label:String(model.cells['B'+(i+5)]?.value||'')})).filter(p=>/^\d/.test(p.label));}
function totals(entries){const days={};for(const e of entries){days[e.day]??=Array(12).fill(0);for(const l of e.lines)days[e.day][roles.indexOf(l.role)*4+categories.indexOf(l.category)]+=l.hours;}return days;}
function link(model,saved){model.rechargeRevision=saved.revision;if(!saved.revision)return;const ps=periods(model),values=ps.map(()=>[0,0,0,0]);for(const e of saved.entries||[])for(let c=0;c<4;c++)if(e.monthly)ps.forEach((p,i)=>values[i][c]+=e.allocations[categories[c]]?.[i]||0);else{const i=ps.findIndex(p=>{const match=p.label.match(/^(\d+)(?:\s*-\s*(\d+))?/);return e.day>=+match[1]&&e.day<=+(match[2]||match[1]);});if(i>=0)values[i][c]+=e.lines.filter(l=>l.category===categories[c]).reduce((s,l)=>s+l.hours,0);}
 for(let i=0;i<6;i++)for(let c=0;c<4;c++)Object.assign(model.cells[String.fromCharCode(75+c)+(i+5)],{value:values[i]?.[c]||0,editable:false,formula:undefined,linked:true});model.rechargeRevision=saved.revision;
}
async function formLayout(){const Excel=require('exceljs'),b=new Excel.Workbook();await b.xlsx.readFile(path.join(__dirname,'data/has-report-templates/rechargeable-2026.xlsx'));const s=b.worksheets[1],cells={};for(let r=1;r<=71;r++)for(let c=1;c<=19;c++){const x=s.getCell(r,c);if(x.isMerged&&x.master!==x)continue;cells[x.address]={value:x.formula?'':x.value instanceof Date?'':x.value?.richText?x.value.richText.map(t=>t.text).join(''):x.value??'',background:x.fill?.fgColor?.argb,bold:x.font?.bold,align:x.alignment?.horizontal};}return {cells,merges:s.model.merges,widths:Array.from({length:19},(_,i)=>s.getColumn(i+1).width||8),fields:detailFields};}
async function workbook(month,scope,entries){
 const Excel=require('exceljs'),book=new Excel.Workbook();await book.xlsx.readFile(path.join(__dirname,'data/has-report-templates/rechargeable-2026.xlsx'));
 const {year,month:m,name}=reportMonth(month),last=new Date(Date.UTC(year,m,0)).getUTCDate(),summary=book.worksheets[0],daily=totals(entries),sample=JSON.parse(JSON.stringify(book.worksheets[1].model));sample.rows=sample.rows.filter(r=>r.number<=71);sample.mergeCells=sample.merges;
 for(const s of [...book.worksheets].slice(1))book.removeWorksheet(s.id);
 summary.getCell('C4').value=scope.station+'/'+scope.account;summary.getCell('C5').value=name.toUpperCase();
 for(let d=1;d<=31;d++){summary.getRow(d+11).hidden=d>last;summary.getCell('B'+(d+11)).value=[...new Set(entries.filter(e=>e.day===d).map(e=>e.flight).filter(Boolean))].join('/');for(let c=0;c<12;c++)summary.getCell(d+11,c+3).value=daily[d]?.[c]||0;}
 for(let c=3;c<=14;c++)summary.getCell(45,c).value={formula:`SUM(${summary.getColumn(c).letter}12:${summary.getColumn(c).letter}42)`,result:Object.values(daily).reduce((s,a)=>s+a[c-3],0)};
 summary.pageSetup.printArea='A1:N45';
 // Keep the supplied daily form's dimensions, merged cells, styles and signature areas.
 const all=[];for(let d=1;d<=last;d++){const found=entries.filter(e=>e.day===d);all.push(...(found.length?found:[{day:d,flight:'',reason:'',lines:[]} ]));}const counts={};for(const e of all){counts[e.day]=(counts[e.day]||0)+1;const title=String(e.day)+(counts[e.day]>1?'-'+counts[e.day]:'');const s=book.addWorksheet(title);s.model={...JSON.parse(JSON.stringify(sample)),id:s.id,name:title};s.name=title;
 s.getCell('B7').value=scope.station+'/'+scope.account;s.getCell('F7').value=new Date(Date.UTC(year,m-1,e.day));s.getCell('F7').numFmt='mm/dd/yyyy';s.getCell('B9').value=e.flight;s.getCell('A16').value=e.reason;s.getCell('A16').alignment={...s.getCell('A16').alignment,wrapText:true};
 for(let r=23;r<=59;r++)for(let c=1;c<=14;c++)s.getCell(r,c).value=null;
 for(const a of detailFields)s.getCell(a).value=e.fields?.[a]||null;
 e.lines.forEach((l,i)=>{const r=l.row||23+i;s.getCell(r,1).value=l.name;s.getCell(r,2+roles.indexOf(l.role)*4+categories.indexOf(l.category)).value=l.hours;s.getCell(r,14).value=l.reason||e.reason;});
 for(let c=2;c<=13;c++)s.getCell(60,c).value={formula:`SUM(${s.getColumn(c).letter}23:${s.getColumn(c).letter}59)`,result:e.lines.filter(l=>2+roles.indexOf(l.role)*4+categories.indexOf(l.category)===c).reduce((n,l)=>n+l.hours,0)};
 s.pageSetup.printArea='A1:S71';}
 book.calcProperties.fullCalcOnLoad=true;return book;
}
function register(app,{context,database,read,key,handler,template,live}){
 const auth=req=>{const c=context(req.reportUser);if(!allowed(c.employee))fail('Rechargeable hours requires Supervisor or above.',403);reportMonth(req.params.month);return c;};
 app.get('/has-report-api/rechargeable/:month',handler(async(req,res)=>{const c=auth(req),saved=read(c.scope,'rechargeable',req.params.month),model=await template('wwh',req.params.month,c.scope);res.json({...saved,entries:saved.entries||[],scope:c.scope,month:req.params.month,periods:periods(model),totals:totals(saved.entries||[]),form:await formLayout()});}));
 app.post('/has-report-api/rechargeable/:month',handler(async(req,res)=>{const c=auth(req),model=await template('wwh',req.params.month,c.scope);const entry=req.body.remove?null:validate(req.body.entry,req.params.month,periods(model));const result=database().transaction(()=>{const saved=read(c.scope,'rechargeable',req.params.month);if(req.body.revision!==saved.revision)fail('Charges changed. Reload before saving.',409);const entries=[...(saved.entries||[])],id=req.body.id;if(req.body.remove&&!id)fail('Choose a charge to delete.');if(id&&!entries.some(e=>e.id===id))fail('Charge no longer exists.',404);const index=entries.findIndex(e=>e.id===id),at=new Date().toISOString(),name=c.employee.nickname||c.employee.name||c.employee.position;if(req.body.remove)entries.splice(index,1);else{const next={...entry,id:id||randomUUID(),updatedAt:at,updatedBy:name};if(index>=0)entries[index]=next;else entries.push(next);}const data={revision:saved.revision+1,values:{},entries,updatedAt:at,updatedBy:name,history:[...(saved.history||[]),{at,name,action:req.body.remove?'Removed charge':id?'Edited charge':'Added charge',id:id||entries.at(-1).id}].slice(-100)};database().prepare('INSERT OR REPLACE INTO has_reports VALUES(?,?,?,?)').run(key(c.scope),'rechargeable',req.params.month,JSON.stringify(data));return data;})();live.publish(c.scope,'wwh',req.params.month);res.json(result);}));
 app.get('/has-report-api/rechargeable/:month/export',handler(async(req,res)=>{const c=auth(req),saved=read(c.scope,'rechargeable',req.params.month),book=await workbook(req.params.month,c.scope,saved.entries||[]);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('Rechargeable_hours_'+req.params.month+'.xlsx').send(await require('./hasReportLayout').exportWorkbook(book));}));
}
module.exports={allowed,validate,periods,totals,link,workbook,register};
