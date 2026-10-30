(() => {
 const $=id=>document.getElementById(id),kinds=['investigation','cos','paf','discussion'];
 let root,workspace,state,inputs={},pending=false,saveQueue=Promise.resolve(),generation=0;
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const message=text=>{$('report-status').textContent=text;};
 function inputFor(field){
  const input=el(field.type==='textarea'?'textarea':'input');input.dataset.wordField=field.key;input.id='word-'+field.key;input.setAttribute('aria-label',field.label);input.required=false;
  if(field.type==='textarea')input.rows=3;else input.type=field.type;
  if(field.type==='checkbox')input.checked=state.values[field.key]===true;
  else{input.value=state.values[field.key]||'';input.maxLength=field.maxLength;}
  if(state.kind==='investigation'&&field.key==='detail_0_0'){input.placeholder='Optional';input.setAttribute('aria-label','Ref No. (optional)');}
  input.addEventListener('change',()=>{
   if(!input.checked||field.type!=='checkbox')return;
   const group=key=>key.startsWith('status_')?'status':key.startsWith('rehire_')?'rehire':/^check_15_\d+_[02]$/.test(key)?'separation':key.startsWith('purpose_')?'purpose':null;
   const current=group(field.key);if(current)for(const [key,other] of Object.entries(inputs))if(key!==field.key&&group(key)===current)other.checked=false;
  });
  inputs[field.key]=input;return input;
 }
 function templateNode(spec){
  if(typeof spec==='string')return document.createTextNode(spec);
  if(spec.field){const field=state.fields.find(field=>field.key===spec.field);if(!field)throw Error('Unknown template field.');return inputFor(field);}
  if(!['div','p','span','strong','small','br','img','table','colgroup','col','tbody','tr','td'].includes(spec.tag))throw Error('Invalid template element.');
  const node=el(spec.tag);if(spec.className)node.className=spec.className;Object.assign(node.style,spec.style||{});
  for(const attr of ['colSpan','rowSpan'])if(spec[attr])node[attr]=spec[attr];
  if(spec.tag==='img'){node.src=spec.src;node.alt=spec.alt||'';}
  node.append(...(spec.children||[]).map(templateNode));return node;
 }
 function mountPolicyPicker(){
  const target=inputs.narrative_17,source=window.PafCompanyPolicies;if(!target||!source?.items?.length)return;
  const version=generation;workspace=el('div');workspace.className='word-report-workspace';root.replaceWith(workspace);
  const aside=el('aside');aside.className='paf-policy-picker';aside.setAttribute('aria-label','Company Policy');
  aside.append(el('h2','Company Policy'),el('p',source.title),el('small',source.source+' · pp. '+source.pages));
  const help=el('p','Drag a policy into Company Policy, or click to add it. You can edit the inserted text.');help.id='paf-policy-help';aside.append(help);
  const label=el('label','Search policies'),search=el('input');search.type='search';search.id='paf-policy-search';search.placeholder='Number or keyword';label.htmlFor=search.id;aside.append(label,search);
  const count=el('p');count.className='paf-policy-count';count.setAttribute('aria-live','polite');const list=el('div');list.className='paf-policy-list';aside.append(count,list);workspace.append(aside,root);
  target.classList.add('paf-policy-dropbox');target.setAttribute('aria-describedby',help.id);
  const add=item=>{if(version!==generation)return;const text=item.number+'. '+item.text,existing=target.value.trimEnd(),value=existing?existing+'\n\n'+text:text;
   if(value.length>target.maxLength){message('Company Policy is full. Shorten the text before adding another policy.');return;}
   target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));target.focus({preventScroll:true});target.setSelectionRange(value.length,value.length);target.scrollTop=target.scrollHeight;message('Policy '+item.number+' added. Save form or Download Word to save.');
  };
  function draw(){list.replaceChildren();const query=search.value.trim().toLowerCase(),items=source.items.filter(item=>!query||(item.number+'. '+item.text).toLowerCase().includes(query));count.textContent=items.length+' of '+source.items.length+' policies';
   for(const item of items){const button=el('button');button.type='button';button.draggable=true;button.className='paf-policy-card';button.dataset.policyNumber=item.number;button.setAttribute('aria-label','Add policy '+item.number+': '+item.text);button.append(el('strong',String(item.number)+'.'),el('span',item.text));button.onclick=()=>add(item);
    button.ondragstart=event=>{event.dataTransfer.setData('application/x-mufc-company-policy',String(item.number));event.dataTransfer.setData('text/plain',item.number+'. '+item.text);event.dataTransfer.effectAllowed='copy';button.classList.add('is-dragging');};button.ondragend=()=>{button.classList.remove('is-dragging');target.classList.remove('policy-drop-active');};list.append(button);
   }if(!items.length)list.append(el('p','No matching policies.'));
  }
  target.ondragover=event=>{if(event.dataTransfer.types.includes('application/x-mufc-company-policy')){event.preventDefault();event.dataTransfer.dropEffect='copy';target.classList.add('policy-drop-active');}};target.ondragleave=()=>target.classList.remove('policy-drop-active');
  target.ondrop=event=>{target.classList.remove('policy-drop-active');const number=event.dataTransfer.getData('application/x-mufc-company-policy');if(!number)return;event.preventDefault();const item=source.items.find(item=>String(item.number)===number);if(item)add(item);};search.oninput=draw;draw();
 }
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
  const version=++generation;state=null;pending=false;workspace?.remove();workspace=null;root?.remove();inputs={};
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
   if(state.layout){form.className='word-template-scroll';const page=el('div');page.className='word-template word-template-'+kind;page.append(...state.layout.map(templateNode));form.append(page);}
   else for(const field of state.fields){const label=el('label'),input=inputFor(field);if(field.type==='textarea')label.className='word-report-narrative';if(field.type==='checkbox'){label.className='word-report-check';label.append(input,document.createTextNode(field.label));}else label.append(document.createTextNode(field.label+(field.key==='detail_0_0'?' (optional)':'')),input);form.append(label);}
   form.oninput=()=>{pending=true;message('Unsaved changes. Save form or Download Word to save.');};root.append(form);if(kind==='paf')mountPolicyPicker();
   message(state.updatedAt?'Saved by '+state.updatedBy+' · '+new Date(state.updatedAt).toLocaleString():'New form · '+state.scope.station+'/'+state.scope.account);
  }catch(error){if(version===generation)message(error.message);}
 }
 function hide(){generation++;workspace?.remove();workspace=null;root?.remove();root=null;state=null;inputs={};pending=false;$('report-editor').hidden=false;$('report-export').hidden=false;document.querySelector('.report-hint').hidden=false;document.querySelector('.report-month-field').hidden=false;}
 window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
 window.addEventListener('has-report-context',()=>{hide();});
 window.hasWordReports={kinds,open,hide,flush,currentKind:()=>state?.kind};
})();
