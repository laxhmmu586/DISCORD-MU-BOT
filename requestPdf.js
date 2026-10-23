const fs=require('node:fs'),path=require('node:path');
const {PDFDocument,rgb}=require('./vendor/pdf-lib/pdf-lib');
const workflow=require('./workflowEvents');
const titles={uniform:'Uniform replacement request',incident:'Incident Investigation Report',expense:'Expense Report',terrific:'Terrific Ten Distribution Form'};
const display={details:'Details',localAmount:'Local total',companyCard:'Company card',foreignAmount:'Foreign amount',exchangeRate:'Exchange rate',dateTime:'Date / time',dailyRate:'Daily rate',nonReusable:'Non-reusable'};
const label=key=>display[key]||key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
const canExport=r=>r.status!=='deleted'&&(r.status!=='draft'||workflow.events(r).some(e=>e.action==='submit'));
async function buildRequestPdf(kind,record,{workflowOnly=false,pageOffset=0}={}){
 record={...record,employee:record.employee||{id:'',name:record.fields?.preparedBy||'-'}};
 const doc=await PDFDocument.create();doc.registerFontkit(require('./vendor/fontkit/fontkit.umd.min'));
 const cjk=/[\u2e80-\u9fff]/.test(JSON.stringify(record)),font=await doc.embedFont(fs.readFileSync(path.join(__dirname,cjk?'vendor/fonts/NotoSansCJKsc-Regular.otf':'vendor/fonts/NotoSans.ttf')),{subset:false}),bold=cjk?font:await doc.embedFont(fs.readFileSync(path.join(__dirname,'vendor/fonts/NotoSans-Bold.ttf')),{subset:false});
 const ink=rgb(.09,.18,.29),blue=rgb(.09,.25,.41),muted=rgb(.36,.45,.54),border=rgb(.82,.87,.92),left=42,width=528,bottom=55;
 let page,y;const pages=[];
 const next=()=>{page=doc.addPage([612,792]);pages.push(page);page.drawText('HALLMARK AVIATION SERVICES',{x:left,y:754,size:9,font:bold,color:blue});page.drawText(titles[kind],{x:left,y:728,size:16,font:bold,color:ink});page.drawLine({start:{x:left,y:715},end:{x:570,y:715},thickness:1,color:border});y=696;};
 const wrap=(value,size,max)=>{const result=[];for(const raw of String(value??'').split(/\r?\n/)){let line='',w=0;for(const char of raw){const cw=font.widthOfTextAtSize(char,size);if(w+cw>max&&line){result.push(line);line='';w=0;}line+=char;w+=cw;}result.push(line||' ');}return result;};
 function paragraph(value,size=10,face=font){for(const line of wrap(value||'-',size,width)){if(y<bottom+size)next();page.drawText(line,{x:left,y,size,font:face,color:ink});y-=size*1.5;}y-=6;}
 function section(title){if(y<bottom+120)next();page.drawRectangle({x:left,y:y-8,width,height:25,color:rgb(.93,.96,.99)});page.drawText(title,{x:left+8,y,size:11,font:bold,color:blue});y-=30;}
 function field(title,value){const lines=wrap(value||'-',10,width);if(y<bottom+36)next();paragraph(title,9,bold);for(const line of lines){if(y<bottom+14)next();page.drawText(line,{x:left,y,size:10,font,color:ink});y-=15;}y-=10;}
 function table(headers,rows,fractions){
  const widths=fractions.map(n=>n*width),size=9,leading=13,padding=7;
  function chunk(cells,fill,header=false){const lines=cells.map((v,i)=>wrap(v,size,widths[i]-padding*2)),height=Math.max(...lines.map(l=>l.length))*leading+padding*2;let x=left;
   cells.forEach((_,i)=>{page.drawRectangle({x,y:y-height,width:widths[i],height,borderWidth:.5,borderColor:border,...(fill?{color:fill}:{})});lines[i].forEach((line,j)=>page.drawText(line,{x:x+padding,y:y-padding-size-j*leading,size,font:header?bold:font,color:ink}));x+=widths[i];});y-=height;
  }
  const heading=()=>chunk(headers,rgb(.93,.96,.99),true);if(y<bottom+80)next();heading();
  for(const row of rows){const cells=row.map((v,i)=>wrap(v??'-',size,widths[i]-padding*2));let offset=0,total=Math.max(...cells.map(c=>c.length));while(offset<total){let capacity=Math.floor((y-bottom-padding*2)/leading);if(capacity<1){next();heading();capacity=Math.floor((y-bottom-padding*2)/leading);}const count=Math.min(capacity,total-offset);chunk(cells.map(c=>c.slice(offset,offset+count).join('\n')),null);offset+=count;if(offset<total){next();heading();}}}y-=24;
 }
 next();
 const formatTime=value=>value&&!Number.isNaN(Date.parse(value))?new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles'})+' PT':value||'-';
 const status=record.needsRevision||record.returnedTo?'Returned for revision':record.status==='pending'?'Pending approval':record.status==='draft'?'Draft after submission':record.status;
 paragraph('Status: '+status+' | Revision: '+(record.revision||1),10,bold);
 paragraph('Submitted: '+formatTime(record.submittedAt||workflow.events(record).find(e=>e.action==='submit')?.at),9);
 if(record.employee){paragraph('Requested by: '+record.employee.name+' | EID: '+(record.employee.eid||'-'),9);paragraph('Account: '+[record.employee.station,record.employee.account].filter(Boolean).join(' / '),9);}
 if(!workflowOnly){
  const definition=kind==='incident'?require('./incidentReports'):kind==='expense'?require('./expenseDefinition'):require('./public/public/terrific-definition');
  const fields=kind==='incident'?record.fields:definition.calculate(record.fields,false);
  section('Form details');for(const [key,title] of Object.entries(definition.fields))field(title,fields[key]);
  if(kind==='expense'){
   for(const [key,keys] of Object.entries(definition.sections)){if(!fields.lines[key].length)continue;section(definition.labels[key]);table(['Details','Local total','Company card','Cash'],fields.lines[key].map(row=>[keys.filter(k=>!['amount','companyCard'].includes(k)&&row[k]).map(k=>label(k)+': '+row[k]).join('\n')||'-',Number(row.localAmount).toFixed(2),Number(row.companyCard||0).toFixed(2),Number(row.cash).toFixed(2)]),[.52,.16,.16,.16]);}
   section('Totals and balance');table(['Item','Amount ('+fields.currency+')'],Object.entries({total:'Total expenses',companyCard:'Company credit card',cash:'Cash expenses',advance:'Travel advance received',dueEmployee:'Due to employee',dueCompany:'Due to company'}).map(([key,title])=>[title,Number(fields.totals[key]).toFixed(2)]),[.75,.25]);
  }else if(kind==='terrific'){
   section('Recipients');table(['Recipient / issuer / account','Award','Contact / reason / message'],fields.lines.general.map(row=>[[row.recipient,'Issued by: '+row.issuedBy,'Account: '+row.account].join('\n'),row.amount,[row.email,row.reason,row.message].filter(Boolean).join('\n')]),[.34,.12,.54]);paragraph('Total awards: '+Number(fields.totals.total).toFixed(2),11,bold);
  }
 }
 section('Workflow history');const events=workflow.events(record);
 if(!events.length)paragraph('No completed workflow actions.');
 for(const [i,event] of events.entries()){if(y<bottom+65)next();paragraph((i+1)+'. '+(event.label||event.action)+' - '+event.name,11,bold);paragraph([event.position,formatTime(event.at)].filter(Boolean).join(' | '),9);paragraph('Remark: '+([event.targetName?'To '+event.targetName:'',event.note].filter(Boolean).join(' | ')||'-'),9);}
 section('Current approval route');for(const [i,stage] of record.stages.entries()){const a=record.approvals[i],state=a?(a.action==='transfer'?'Transferred':a.action==='reject'?'Rejected':'Approved')+' by '+a.name:record.status==='pending'&&record.step===i?'Awaiting review':record.status==='rejected'?'Not reached':'Upcoming';paragraph((i+1)+'. '+stage+' - '+state,9);}
 pages.forEach((p,i)=>{p.drawLine({start:{x:left,y:38},end:{x:570,y:38},thickness:.5,color:border});p.drawText((i+1+pageOffset)+' / '+(pages.length+pageOffset)+' | '+record.id,{x:left,y:24,size:8,font,color:muted});});
 return Buffer.from(await doc.save());
}
function registerPdf(app,{kind,store,user}){
 app.get('/'+kind+'-api/:id/pdf',async(req,res)=>{try{const r=store.read(user(req),req.params.id);if(!canExport(r))throw Object.assign(Error('Submit this request before exporting PDF.'),{status:409});const bytes=await buildRequestPdf(kind,r);res.type('application/pdf').set('Content-Disposition','attachment; filename="'+kind+'-'+r.id+'-r'+r.revision+'.pdf"').send(bytes);}catch(error){res.status(error.status||400).json({error:error.message});}});
}
module.exports={buildRequestPdf,canExport,registerPdf};
