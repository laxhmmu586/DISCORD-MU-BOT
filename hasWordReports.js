// Keep the supplied Word packages intact; fill only the declared text slots.
const fs=require('node:fs/promises'),path=require('node:path');
const definitions=require('./data/has-word-templates/forms.json');
const layouts=require('./data/has-word-templates/layouts.json');
const kinds=definitions.map(form=>form.kind);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const definition=kind=>definitions.find(form=>form.kind===kind)||fail('Unknown Word report.',404);
function validate(kind,values){
 if(!values||typeof values!=='object'||Array.isArray(values))fail('Invalid form values.');
 const fields=definition(kind).fields,result={};
 for(const [key,value] of Object.entries(values)){
  const field=fields.find(f=>f.key===key);if(!field)fail('Unknown form field: '+key);
  if(field.printOnly)fail('Signatures and signature dates must be completed on the printed form.');
  if(field.type==='checkbox'){if(typeof value!=='boolean')fail('Invalid checkbox.');}
  else if(typeof value!=='string'||value.length>field.maxLength||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))fail('Invalid value for '+field.label+'.');
  if(field.type==='date'&&value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))fail('Invalid date for '+field.label+'.');
  result[key]=value;
 }
 return result;
}
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
async function exportWord(kind,values={}){
 const form=definition(kind);values=validate(kind,Object.fromEntries(Object.entries(values).filter(([key])=>!form.fields.find(f=>f.key===key)?.printOnly)));
 if(kind!=='cos'&&!Object.values(values).some(Boolean))return fs.readFile(path.join(__dirname,'data/has-word-templates',kind+'-blank.docx'));
 const JSZip=require('node:module').createRequire(require.resolve('exceljs'))('jszip');
 const zip=await JSZip.loadAsync(await fs.readFile(path.join(__dirname,'data/has-word-templates',kind+'.docx')));
 let xml=await zip.file('word/document.xml').async('string');
 xml=xml.replace(/\{\{([a-z0-9_]+)\}\}/g,(_,key)=>{
  const field=form.fields.find(f=>f.key===key||f.slots?.includes(key));if(!field)throw Error('Unmapped Word field.');
  let value=values[field.key];
  if(field.slots&&value){const lines=value.split(/\r\n|\r|\n/),index=field.slots.indexOf(key);value=index===field.slots.length-1?lines.slice(index).join('\n'):lines[index]||'';}
  let display=field.type==='checkbox'?(value?(field.fallback==='☐'?'☒':'X'):field.fallback):(value||field.fallback);
  if(field.type==='date'&&value)display=value.slice(5,7)+'/'+value.slice(8,10)+'/'+value.slice(2,4);
  if(kind==='discussion'&&value&&field.fallback.startsWith('_'))display+='  ';
  // Word requires explicit line breaks. Never interpolate user text as XML.
  return escape(display).replace(/\r\n|\r|\n/g,'</w:t><w:br/><w:t xml:space="preserve">');
 });
 zip.file('word/document.xml',xml);return zip.generateAsync({type:'nodebuffer'});
}
function register(app,{context,database,read,key,handler,allowed}){
 const auth=req=>{const ctx=context(req.reportUser);if(!allowed(ctx.employee))fail('Word reports require Supervisor or above in your Main Account.',403);definition(req.params.form);return ctx;};
 // Drafts belong to the authenticated primary Main Account, like other reports.
 const storage=form=>'word-'+form;
 const visibleValues=(kind,values)=>Object.fromEntries(Object.entries(values).filter(([key])=>!definition(kind).fields.find(field=>field.key===key)?.printOnly));
 const defaults=(kind,ctx,values)=>kind==='investigation'?{...values,detail_1_0:values.detail_1_0||ctx.scope.station+'/'+ctx.scope.account,detail_2_0:values.detail_2_0||ctx.employee.name||ctx.employee.nickname||'',detail_2_1:values.detail_2_1||require('./public/public/employee-positions').normalize(ctx.employee.position)||''}:values;
 app.get('/has-report-api/word/:form',handler(async(req,res)=>{
  const ctx=auth(req),saved=read(ctx.scope,storage(req.params.form),'draft');
  const form=definition(req.params.form);res.json({...form,fields:form.fields.filter(field=>!field.printOnly),layout:layouts[req.params.form],...saved,values:defaults(req.params.form,ctx,visibleValues(req.params.form,saved.values)),scope:ctx.scope});
 }));
 app.post('/has-report-api/word/:form',handler(async(req,res)=>{
  const ctx=auth(req),values=defaults(req.params.form,ctx,validate(req.params.form,req.body.values));
  const data=database().transaction(()=>{
   const saved=read(ctx.scope,storage(req.params.form),'draft');
   if(req.body.revision!==saved.revision)fail('This form changed. Reload before saving.',409);
   const data={revision:saved.revision+1,values,updatedAt:new Date().toISOString(),updatedBy:ctx.employee.nickname||ctx.employee.name||ctx.employee.position};
   database().prepare('INSERT OR REPLACE INTO has_reports VALUES(?,?,?,?)').run(key(ctx.scope),storage(req.params.form),'draft',JSON.stringify(data));return data;
  })();res.json(data);
 }));
 app.get('/has-report-api/word/:form/export',handler(async(req,res)=>{
  const ctx=auth(req),saved=read(ctx.scope,storage(req.params.form),'draft'),buffer=await exportWord(req.params.form,defaults(req.params.form,ctx,saved.values));
  const latest=auth(req);if(key(latest.scope)!==key(ctx.scope))fail('Your Main Account changed. Reload the form.',403);
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').attachment(definition(req.params.form).title.replace(/[^a-zA-Z0-9]+/g,'_')+'.docx').send(buffer);
 }));
}
module.exports={kinds,definition,validate,exportWord,register};
