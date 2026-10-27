(() => {
 const $=id=>document.getElementById(id),kinds=['investigation','cos','paf','discussion'];
 let root,state,inputs={},pending=false,saveQueue=Promise.resolve(),generation=0;
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const message=text=>{$('report-status').textContent=text;};
 function values(){return Object.fromEntries(state.fields.map(field=>[field.key,field.type==='checkbox'?inputs[field.key].checked:inputs[field.key].value]));}
 async function flush(){
  const form=state,version=generation;if(!form||!pending)return saveQueue;
  const snapshot=values();pending=false;
  const task=saveQueue.catch(()=>{}).then(async()=>{
   if(version!==generation)throw Error('The form changed. Reload before saving.');
   try{message('Saving form…');const saved=await window.hasReportRequest('/word/'+form.kind,{revision:form.revision,values:snapshot});if(version!==generation)return;Object.assign(form,saved);message('Saved by '+saved.updatedBy+' · '+new Date(saved.updatedAt).toLocaleString());}
   catch(error){if(version===generation){pending=true;message(error.message);}throw error;}
  });saveQueue=task;return task;
 }
 async function open(kind){
  const version=++generation;state=null;pending=false;root?.remove();inputs={};
  $('report-editor').hidden=true;$('report-export').hidden=true;$('report-instructions').hidden=true;
  document.querySelector('.report-hint').hidden=true;
  document.querySelector('.report-month-field').hidden=true;
  root=el('section');root.className='word-report';$('report-editor').after(root);message('Loading form…');
  try{
   const next=await window.hasReportRequest('/word/'+kind);if(version!==generation)return;state=next;
   root.append(el('h2',state.title));const toolbar=el('div');toolbar.className='word-report-actions';
   const save=el('button','Save form');save.type='button';save.onclick=()=>void flush().catch(()=>{});
   const download=el('button','Download Word');download.type='button';download.onclick=async()=>{
    save.disabled=download.disabled=true;
    try{await flush();const blob=await window.hasReportRequest('/word/'+kind+'/export');if(version!==generation)return;const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=state.title.replace(/[^a-zA-Z0-9]+/g,'_')+'.docx';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);message('Word document downloaded.');}
    catch(error){message(error.message);}finally{save.disabled=download.disabled=false;}
   };toolbar.append(save,download);root.append(toolbar,el('p','Complete the fields below. Download Word uses the supplied document layout.'));
   const form=el('form');form.className='word-report-fields';form.onsubmit=e=>e.preventDefault();
   for(const field of state.fields){
    const label=el('label'),input=el(field.type==='textarea'?'textarea':'input');
    input.dataset.wordField=field.key;input.id='word-'+field.key;
    if(field.type==='textarea'){label.className='word-report-narrative';input.rows=5;}else input.type=field.type;
    if(field.type==='checkbox'){input.checked=state.values[field.key]===true;label.className='word-report-check';label.append(input,document.createTextNode(field.label));}
    else{input.value=state.values[field.key]||'';input.maxLength=field.maxLength;label.append(document.createTextNode(field.label),input);}
    inputs[field.key]=input;form.append(label);
   }
   form.oninput=()=>{pending=true;message('Unsaved changes. Save form or Download Word to save.');};root.append(form);
   message(state.updatedAt?'Saved by '+state.updatedBy+' · '+new Date(state.updatedAt).toLocaleString():'New form · '+state.scope.station+'/'+state.scope.account);
  }catch(error){if(version===generation)message(error.message);}
 }
 function hide(){generation++;root?.remove();root=null;state=null;inputs={};pending=false;$('report-editor').hidden=false;$('report-export').hidden=false;document.querySelector('.report-hint').hidden=false;document.querySelector('.report-month-field').hidden=false;}
 window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
 window.addEventListener('has-report-context',()=>{hide();});
 window.hasWordReports={kinds,open,hide,flush,currentKind:()=>state?.kind};
})();
