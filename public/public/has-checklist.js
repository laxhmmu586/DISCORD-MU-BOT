(() => {
 let generation=0,selection=0,previewUrl,dirty=false;
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const clearPreview=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;document.getElementById('checklist-preview')?.remove();};
 function selectContent(){if(dirty&&!confirm('Discard unsaved emergency procedure changes?'))return null;selection++;clearPreview();document.getElementById('emergency-editor')?.remove();dirty=false;return selection;}
 window.addEventListener('pagehide',clearPreview);
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 window.addEventListener('has-report-context',async event=>{
  const version=++generation,ctx=event.detail,status=document.getElementById('checklist-status'),content=document.getElementById('checklist-content'),scope=document.getElementById('checklist-scope');
  selection++;clearPreview();dirty=false;content.hidden=true;content.replaceChildren();scope.textContent='';
  if(ctx.error||!ctx.canChecklist){status.textContent=ctx.error||'Checklist requires Agent or above in your Main Account.';return;}
  try{
   const data=await window.hasReportRequest('/checklist');if(version!==generation)return;scope.textContent=data.scope.station+'/'+data.scope.account+' · Main Account';content.hidden=false;status.textContent='';
   for(const category of data.categories){
    content.append(el('h2',category.name));const list=el('div');list.className='checklist-grid';
    for(const item of category.items){
     const card=el('article');card.className='checklist-card';card.append(el('h3',item.title),el('p',item.version));const actions=el('div');actions.className='word-report-actions';
     const choices=item.id==='emergency-notification'?[['view',item.canEdit?'View / Edit':'View'],['export','Download PDF']]:[['preview','Preview'],['export','Download PDF']];
     for(const [action,label] of choices){
      const button=el('button',label);button.type='button';button.onclick=async()=>{
       button.disabled=true;
       try{
        const selected=action==='export'&&item.id==='emergency-notification'?selection:selectContent();if(selected===null)return;
        if(action==='view'){await emergency(item,version,selected);return;}
        if(action==='export'&&item.id==='emergency-notification'&&dirty)throw Error('Save your emergency procedure changes before downloading the PDF.');
        const blob=await window.hasReportRequest('/checklist/'+item.id+'/'+action);if(version!==generation||selected!==selection)return;
        if(action==='export'){const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=item.id+'.'+item.format;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status.textContent='Download ready.';}
        else{clearPreview();previewUrl=URL.createObjectURL(blob);const panel=el('section'),frame=el('iframe'),close=el('button','Close preview');panel.id='checklist-preview';close.type='button';close.onclick=clearPreview;frame.src=previewUrl;frame.title=item.title;panel.append(el('h2',item.title),close,frame);content.append(panel);panel.scrollIntoView({behavior:'smooth',block:'start'});status.textContent='';}
       }catch(error){if(version===generation)status.textContent=error.message;}finally{button.disabled=false;}
      };actions.append(button);
     }card.append(actions);list.append(card);
    }content.append(list);
   }
  }catch(error){if(version===generation)status.textContent=error.message;}
  async function emergency(item,version,selected){
   const data=await window.hasReportRequest('/checklist/emergency-notification/content');if(version!==generation||selected!==selection)return;
   clearPreview();document.getElementById('emergency-editor')?.remove();dirty=false;
   const panel=el('section');panel.id='emergency-editor';panel.className='word-report';panel.append(el('h2',item.title));const close=el('button','Close');close.type='button';close.setAttribute('aria-label','Close emergency procedure');close.onclick=selectContent;panel.append(close);const fields=[];
   const form=el('form');form.className='emergency-contact-form';form.onsubmit=event=>event.preventDefault();
   const intro=el('p','Complete the notification contacts for this account, then save before downloading your PDF.');intro.className='emergency-intro';panel.append(intro);
   const contacts=data.contacts||window.emergencyNotification.normalize(data.values);
   for(const call of data.calls||window.emergencyNotification.calls){
    const group=el('fieldset');group.className='emergency-call';const legend=el('legend',call.ordinal+' CALL: '+call.title);group.append(legend);const grid=el('div');grid.className='emergency-contact-grid';
    for(const kind of ['name','phone']){const key=call[kind];if(!key)continue;const label=el('label',kind==='name'?'Name':'Phone');let input;
     if(call.select&&kind==='name'){input=el('select');const placeholder=el('option','Select a manager');placeholder.value='';input.append(placeholder);const names=[...new Set([contacts[key],...(data.directory||[]).map(row=>row.name)].filter(Boolean))];for(const name of names){const option=el('option',name);option.value=name;input.append(option);}input.disabled=!data.canEdit;}
     else{input=el('input');input.type=kind==='phone'?'tel':'text';input.readOnly=!data.canEdit;input.maxLength=kind==='phone'?80:160;input.autocomplete=kind==='phone'?'tel':'name';}
     input.value=contacts[key]||'';input.required=true;input.dataset.emergencyField=key;input.setAttribute('aria-label',call.ordinal+' call '+kind);label.append(input);grid.append(label);fields.push([key,input]);
    }group.append(grid);form.append(group);
   }
   panel.append(form);const reminders=el('div');reminders.className='emergency-reminders';reminders.append(el('p','8th: Debrief all employees involved that they are NOT to talk to any media, press, newspapers, or radio representatives.'),el('p','9th: The Hallmark Incident / Occurrence Report must be completed BEFORE leaving the station.'));panel.append(reminders);
   panel.addEventListener('input',()=>{dirty=true;status.textContent='Unsaved emergency procedure changes.';});
   if(data.canEdit){const save=el('button','Save changes');save.type='button';save.onclick=async()=>{if(!form.reportValidity())return;save.disabled=true;try{const snapshot={...data.values,...Object.fromEntries(fields.map(([key,input])=>[key,input.value.trim()]))};const result=await window.hasReportRequest('/checklist/emergency-notification/content',{revision:data.revision,values:snapshot});if(version!==generation||selected!==selection)return;data.revision=result.revision;dirty=fields.some(([key,input])=>input.value.trim()!==snapshot[key]);status.textContent=dirty?'New changes remain unsaved.':'Emergency procedure saved.';}catch(error){if(version===generation)status.textContent=error.message;}finally{save.disabled=false;}};panel.append(save);}
   content.append(panel);panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
 });
 if(window.hasReportContext)window.dispatchEvent(new CustomEvent('has-report-context',{detail:window.hasReportContext}));
})();
