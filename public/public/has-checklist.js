(() => {
 let generation=0,previewUrl,dirty=false;
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const clearPreview=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;document.getElementById('checklist-preview')?.remove();};
 window.addEventListener('pagehide',clearPreview);
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 window.addEventListener('has-report-context',async event=>{
  const version=++generation,ctx=event.detail,status=document.getElementById('checklist-status'),content=document.getElementById('checklist-content'),scope=document.getElementById('checklist-scope');
  clearPreview();dirty=false;content.hidden=true;content.replaceChildren();scope.textContent='';
  if(ctx.error||!ctx.canChecklist){status.textContent=ctx.error||'Checklist requires Agent or above in your Main Account.';return;}
  try{
   const data=await window.hasReportRequest('/checklist');if(version!==generation)return;scope.textContent=data.scope.station+'/'+data.scope.account+' · Main Account';content.hidden=false;status.textContent='';
   for(const category of data.categories){
    content.append(el('h2',category.name));const list=el('div');list.className='checklist-grid';
    for(const item of category.items){
     const card=el('article');card.className='checklist-card';card.append(el('h3',item.title),el('p',item.version));const actions=el('div');actions.className='word-report-actions';
     const choices=item.id==='emergency-notification'?[['view',item.canEdit?'View / Edit':'View'],['export','Download Word']]:[['preview','Preview'],['export','Download PDF']];
     for(const [action,label] of choices){
      const button=el('button',label);button.type='button';button.onclick=async()=>{
       button.disabled=true;
       try{
        if(action==='view'){await emergency(item,version);return;}
        const blob=await window.hasReportRequest('/checklist/'+item.id+'/'+action);if(version!==generation)return;
        if(action==='export'){const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=item.id+'.'+item.format;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status.textContent='Download ready.';}
        else{clearPreview();previewUrl=URL.createObjectURL(blob);const panel=el('section'),frame=el('iframe'),close=el('button','Close preview');panel.id='checklist-preview';close.type='button';close.onclick=clearPreview;frame.src=previewUrl;frame.title=item.title;panel.append(el('h2',item.title),close,frame);content.append(panel);panel.scrollIntoView({behavior:'smooth',block:'start'});status.textContent='';}
       }catch(error){if(version===generation)status.textContent=error.message;}finally{button.disabled=false;}
      };actions.append(button);
     }card.append(actions);list.append(card);
    }content.append(list);
   }
  }catch(error){if(version===generation)status.textContent=error.message;}
  async function emergency(item,version){
   if(dirty&&!confirm('Discard unsaved emergency procedure changes?'))return;
   const data=await window.hasReportRequest('/checklist/emergency-notification/content');if(version!==generation)return;
   clearPreview();document.getElementById('emergency-editor')?.remove();dirty=false;
   const panel=el('section');panel.id='emergency-editor';panel.className='word-report';panel.append(el('h2',item.title));const fields=[];
   for(const field of data.fields){const input=el('textarea');input.value=data.values[field.key]??field.value;input.rows=Math.max(2,Math.ceil(input.value.length/90));input.maxLength=4000;input.dataset.emergencyField=field.key;input.setAttribute('aria-label',field.label);input.readOnly=!data.canEdit;const label=el('label',field.label);label.append(input);panel.append(label);fields.push([field.key,input]);}
   panel.addEventListener('input',()=>{dirty=true;status.textContent='Unsaved emergency procedure changes.';});
   if(data.canEdit){const save=el('button','Save changes');save.type='button';save.onclick=async()=>{save.disabled=true;try{const snapshot=Object.fromEntries(fields.map(([key,input])=>[key,input.value]));const result=await window.hasReportRequest('/checklist/emergency-notification/content',{revision:data.revision,values:snapshot});if(version!==generation)return;data.revision=result.revision;dirty=fields.some(([key,input])=>input.value!==snapshot[key]);status.textContent=dirty?'New changes remain unsaved.':'Emergency procedure saved.';}catch(error){if(version===generation)status.textContent=error.message;}finally{save.disabled=false;}};panel.append(save);}
   content.append(panel);panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
 });
 if(window.hasReportContext)window.dispatchEvent(new CustomEvent('has-report-context',{detail:window.hasReportContext}));
})();
