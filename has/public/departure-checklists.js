(() => {
 const model=window.DepartureChecklistModel,button=document.getElementById('briefing-checklists');if(!model||!button)return;
 const {esc}=model,query=new URLSearchParams(location.search),dialog=document.createElement('dialog'),editor=document.createElement('dialog');
 dialog.className='checklist-dialog';dialog.setAttribute('aria-labelledby','checklist-title');
 dialog.innerHTML='<aside class="cl-sidebar"><div class="cl-brand"><span aria-hidden="true">☷</span><strong>Checklists</strong></div><p class="cl-section-label">TEMPLATES</p><nav aria-label="Checklist templates"></nav><button type="button" data-cl-new>＋ New checklist</button><p class="cl-sidebar-note">Print a blank checklist and complete it on paper.</p></aside><div class="cl-main"><header class="cl-header"><div><p class="cl-section-label">PRINTABLE TEMPLATES</p><h2 id="checklist-title">Checklists</h2></div><button type="button" data-cl-close aria-label="Close Checklists">×</button></header><div class="cl-toolbar"><button type="button" data-cl-template>Edit template</button><label>Paper <select data-cl-paper aria-label="Checklist paper size"><option>A4</option><option>Letter</option></select></label><button type="button" data-cl-print class="cl-primary">Print</button></div><p data-cl-status class="cl-status" role="status" aria-live="polite"></p><div class="cl-content"></div></div>';
 editor.className='checklist-template-dialog';editor.setAttribute('aria-labelledby','cl-template-title');editor.innerHTML='<header class="cl-header"><div><p class="cl-section-label">SHARED TEMPLATE</p><h2 id="cl-template-title">Edit template</h2></div><button type="button" data-template-close aria-label="Close template editor">×</button></header><p class="cl-template-help">Edit the shared printable template. Checklists are completed on paper.</p><p data-template-status role="status"></p><form><div class="cl-template-body"></div><footer class="cl-template-footer"><button type="button" data-template-add>＋ Add item</button><button type="submit" class="cl-primary">Save template</button></footer></form>';
 document.body.append(dialog,editor);
 const content=dialog.querySelector('.cl-content'),status=dialog.querySelector('[data-cl-status]'),editorBody=editor.querySelector('.cl-template-body'),editorStatus=editor.querySelector('[data-template-status]');
 let context=null,type='avih',templates=new Map(),busy=false,generation=0,templateDraft=null,templateDirty=false;
 const api=(path='',body)=>peopleApi('/briefing-api/checklists'+path,body);
 const activeKey=value=>value?value.date+'|'+value.flight:'';
 function lock(value){busy=value;for(const el of dialog.querySelectorAll('button,select'))el.disabled=value;}
 function render(){
  const nav=dialog.querySelector('nav');
  nav.innerHTML=[...templates.values()].map(def=>'<button type="button" data-cl-type="'+esc(def.type)+'"><span class="cl-dog-icon" aria-hidden="true">'+({avih:'🐕','service-dog':'🐕‍🦺',vip:'<span class="cl-vip-icon">VIP</span>'}[def.type]||'☷')+'</span>'+esc(def.name)+'</button>').join('');
  const def=templates.get(type);dialog.querySelector('#checklist-title').textContent=def.name;
  for(const item of dialog.querySelectorAll('[data-cl-type]'))item.setAttribute('aria-pressed',String(item.dataset.clType===type));
  content.innerHTML='<div class="cl-template-preview">'+model.printHtml(def)+'</div><p class="cl-source">Template v'+def.revision+(def.sourceUrl?' · <a target="_blank" rel="noopener noreferrer" href="'+esc(def.sourceUrl)+'">Source document ↗</a>':' · '+esc(def.source))+'</p>';
  sizePreview();
 }
 function sizePreview(){const preview=content.querySelector('.cl-template-preview');if(preview)preview.style.setProperty('--cl-preview-scale',Math.min(1,Math.max(0.1,(preview.clientWidth-24)/720)));}
 new ResizeObserver(sizePreview).observe(content);
 function close(){if(busy)return;generation++;dialog.close();content.replaceChildren();}
 dialog.querySelector('[data-cl-close]').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.querySelector('nav').onclick=event=>{
  const item=event.target.closest('[data-cl-type]');
  if(!item||busy)return;type=item.dataset.clType;render();dialog.querySelector('[aria-pressed="true"]').focus();status.textContent='Blank template · Print and complete on paper.';
 };
 dialog.querySelector('[data-cl-new]').onclick=()=>{
  if(busy||!context)return;
  templateDraft={type:null,name:'',title:'',subtitle:'',items:[{id:crypto.randomUUID(),zh:'',en:''}]};
  templateDirty=false;editor.querySelector('#cl-template-title').textContent='New checklist';editorStatus.textContent='';renderTemplate();editor.showModal();
 };
 button.onclick=async()=>{
  if(!context||busy||dialog.open)return;const run=++generation;lock(true);status.textContent='Loading templates…';content.replaceChildren();dialog.showModal();
  try{const result=await api('/templates');if(run!==generation)return;templates=new Map(result.templates.map(def=>[def.type,def]));render();status.textContent='Blank template · Print and complete on paper.';}
  catch(error){if(run===generation){dialog.close();document.getElementById('briefing-status').textContent=error.message;}}
  finally{if(run===generation)lock(false);}
 };
 function captureTemplate(){if(!templateDraft)return;templateDraft.name=editorBody.querySelector('[data-template-name]').value;templateDraft.title=editorBody.querySelector('[data-template-title]').value;templateDraft.subtitle=editorBody.querySelector('[data-template-subtitle]').value;for(const row of editorBody.querySelectorAll('[data-template-item]')){const item=templateDraft.items.find(item=>item.id===row.dataset.templateItem);item.zh=row.querySelector('[data-template-zh]').value;item.en=row.querySelector('[data-template-en]').value;}}
 function renderTemplate(){editorBody.innerHTML='<div class="cl-template-titles"><label>Checklist name<input data-template-name maxlength="80" required value="'+esc(templateDraft.name)+'"></label><label>Chinese title<input data-template-title maxlength="200" required value="'+esc(templateDraft.title)+'"></label><label>English title<input data-template-subtitle maxlength="300" value="'+esc(templateDraft.subtitle)+'"></label></div>'+templateDraft.items.map((item,i)=>'<section class="cl-template-item" data-template-item="'+item.id+'"><header><strong>Item '+(i+1)+'</strong><div><button type="button" data-item-move="-1" aria-label="Move item '+(i+1)+' up"'+(!i?' disabled':'')+'>↑</button><button type="button" data-item-move="1" aria-label="Move item '+(i+1)+' down"'+(i===templateDraft.items.length-1?' disabled':'')+'>↓</button><button type="button" data-item-remove aria-label="Remove item '+(i+1)+'"'+(templateDraft.items.length===1?' disabled':'')+'>Remove</button></div></header><label>中文<textarea data-template-zh rows="3" maxlength="2000">'+esc(item.zh)+'</textarea></label><label>English<textarea data-template-en rows="3" maxlength="3000">'+esc(item.en)+'</textarea></label></section>').join('');editor.querySelector('[data-template-add]').disabled=templateDraft.items.length>=60;}
 dialog.querySelector('[data-cl-template]').onclick=async()=>{
  if(busy||!context)return;const run=generation;lock(true);
  try{const result=await api('/templates');if(run!==generation)return;templates=new Map(result.templates.map(def=>[def.type,def]));templateDraft=structuredClone(templates.get(type));templateDirty=false;editor.querySelector('#cl-template-title').textContent='Edit '+templateDraft.name+' template';editorStatus.textContent='';renderTemplate();editor.showModal();}
  catch(error){if(run===generation)status.textContent=error.message;}finally{if(run===generation)lock(false);}
 };
 editorBody.addEventListener('input',()=>{templateDirty=true;});
 editorBody.addEventListener('click',event=>{const action=event.target.closest('[data-item-move],[data-item-remove]');if(!action)return;captureTemplate();const row=action.closest('[data-template-item]'),i=templateDraft.items.findIndex(item=>item.id===row.dataset.templateItem);if(action.hasAttribute('data-item-remove')){if(templateDraft.items.length<2)return;templateDraft.items.splice(i,1);}else{const j=i+Number(action.dataset.itemMove);if(j<0||j>=templateDraft.items.length)return;[templateDraft.items[i],templateDraft.items[j]]=[templateDraft.items[j],templateDraft.items[i]];}templateDirty=true;renderTemplate();});
 editor.querySelector('[data-template-add]').onclick=()=>{if(templateDraft.items.length>=60)return;captureTemplate();templateDraft.items.push({id:crypto.randomUUID(),zh:'',en:''});templateDirty=true;renderTemplate();editorBody.lastElementChild.querySelector('textarea').focus();};
 const closeEditor=()=>{if(busy)return;editor.close();templateDraft=null;templateDirty=false;};editor.querySelector('[data-template-close]').onclick=closeEditor;editor.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
 editor.querySelector('form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;captureTemplate();const run=generation;busy=true;for(const el of editor.querySelectorAll('button,input,textarea'))el.disabled=true;editorStatus.textContent='Saving template…';
  try{const def=await api('/templates',templateDraft);if(run!==generation)return;type=def.type;templates.set(type,def);editor.close();templateDirty=false;templateDraft=null;render();status.textContent='Template saved. Ready to print.';}
  catch(error){if(run===generation)editorStatus.textContent=error.message;}finally{if(run===generation){busy=false;for(const el of editor.querySelectorAll('button,input,textarea'))el.disabled=false;if(templateDraft)renderTemplate();}}
 };
 dialog.querySelector('[data-cl-print]').onclick=async()=>{
  if(busy||!context||!templates.has(type))return;const run=generation,frame=document.createElement('iframe');frame.className='cl-print-frame';frame.title=templates.get(type).name+' checklist print';document.body.append(frame);const doc=frame.contentDocument;
  const loaded=new Promise(resolve=>frame.onload=resolve);doc.open();doc.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+esc(templates.get(type).name+' Checklist')+'</title><link rel="stylesheet" href="/has/departure-checklists.css?v=20261102-print-templates"><style>@page{size:'+dialog.querySelector('[data-cl-paper]').value+' portrait;margin:10mm}</style></head><body class="cl-print-document">'+model.printHtml(templates.get(type))+'</body></html>');doc.close();
  try{await loaded;await doc.fonts.ready;if(run!==generation){frame.remove();return;}frame.contentWindow.addEventListener('afterprint',()=>setTimeout(()=>frame.remove(),1000),{once:true});frame.contentWindow.focus();frame.contentWindow.print();}
  catch{frame.remove();status.textContent='Print preview could not load. Please retry.';}
 };
 const updateDirection=event=>{
  const d=event.detail,ready=d.ready&&d.direction==='departure'&&d.canUseChecklists&&!query.has('quick')&&!query.has('embed');button.hidden=!ready;const next=ready?{date:d.date,flight:d.flight}:null;
  if(!ready||activeKey(context)!==activeKey(next)){generation++;if(editor.open)editor.close();if(dialog.open)dialog.close();templateDraft=null;templates.clear();content.replaceChildren();editorBody.replaceChildren();for(const frame of document.querySelectorAll('.cl-print-frame'))frame.remove();for(const el of editor.querySelectorAll('button,input,textarea'))el.disabled=false;templateDirty=false;busy=false;}
  context=next;
 };
 window.addEventListener('briefing-direction',updateDirection);
 updateDirection({detail:window.briefingToolContext});
 window.addEventListener('beforeunload',event=>{if(templateDirty||busy){event.preventDefault();event.returnValue='';}});
})();
