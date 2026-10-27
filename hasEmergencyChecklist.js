const fs=require('node:fs/promises'),path=require('node:path');
const fields=require('./data/has-checklists/emergency-fields.json');
const filename=path.join(__dirname,'data/has-checklists/emergency-procedure-notification.docx');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function validate(values){
 if(!values||typeof values!=='object'||Array.isArray(values))fail('Invalid emergency procedure content.');
 for(const [key,value] of Object.entries(values))if(!fields.some(f=>f.key===key)||typeof value!=='string'||value.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))fail('Invalid emergency procedure section.');
 return values;
}
async function exportWord(values={}){
 validate(values);const original=await fs.readFile(filename);
 if(fields.every(f=>values[f.key]===undefined||values[f.key]===f.value))return original;
 const JSZip=require('node:module').createRequire(require.resolve('exceljs'))('jszip'),zip=await JSZip.loadAsync(original);
 let index=-1;const xml=(await zip.file('word/document.xml').async('string')).replace(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g,paragraph=>{
  index++;const field=fields.find(f=>f.index===index);if(!field||values[field.key]===undefined||values[field.key]===field.value)return paragraph;
  let first=true;const escaped=values[field.key].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r\n|\r|\n/g,'</w:t><w:br/><w:t xml:space="preserve">');
  // Only edited paragraphs lose their old inline text segmentation; page and run
  // properties, drawings, logos, unchanged paragraphs and package parts survive.
  return paragraph.replace(/<w:(?:tab|br)\b[^>]*\/>/g,'').replace(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g,()=>{const text=first?escaped:'';first=false;return '<w:t xml:space="preserve">'+text+'</w:t>';});
 });zip.file('word/document.xml',xml);return zip.generateAsync({type:'nodebuffer'});
}
function register(app,{context,handler,allowed,supervisor,database,read,key}){
 const auth=(req,edit=false)=>{const ctx=context(req.reportUser);if(!allowed(ctx.employee)||edit&&!supervisor(ctx.employee))fail(edit?'Editing requires Supervisor or above in your Main Account.':'Checklist access denied.',403);return ctx;};
 const get=ctx=>read(ctx.scope,'checklist-emergency','current');
 app.get('/has-report-api/checklist/emergency-notification/content',handler(async(req,res)=>{const ctx=auth(req);res.json({scope:ctx.scope,fields,...get(ctx),canEdit:supervisor(ctx.employee)});}));
 app.post('/has-report-api/checklist/emergency-notification/content',handler(async(req,res)=>{
  const ctx=auth(req,true),values=validate(req.body.values);
  const data=database().transaction(()=>{const saved=get(ctx);if(saved.revision!==req.body.revision)fail('This procedure changed. Reload before saving.',409);const data={revision:saved.revision+1,values,updatedAt:new Date().toISOString(),updatedBy:ctx.employee.nickname||ctx.employee.name||ctx.employee.position};database().prepare('INSERT OR REPLACE INTO has_reports VALUES(?,?,?,?)').run(key(ctx.scope),'checklist-emergency','current',JSON.stringify(data));return data;})();res.json(data);
 }));
 app.get('/has-report-api/checklist/emergency-notification/export',handler(async(req,res)=>{
  const ctx=auth(req),buffer=await exportWord(get(ctx).values),latest=auth(req);if(key(ctx.scope)!==key(latest.scope))fail('Your Main Account changed. Reload the page.',403);
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').attachment('Emergency_Procedure_Notification.docx').send(buffer);
 }));
}
module.exports={fields,validate,exportWord,register};
