window.createBriefingDefaults=({getCurrent,getDirection,api,flush,isBusy,isQuick})=>{
 const button=document.getElementById('briefing-defaults'),dialog=document.createElement('dialog');dialog.className='departure-defaults-dialog';dialog.setAttribute('aria-labelledby','departure-defaults-title');
 dialog.innerHTML='<header><h2 id="departure-defaults-title">Departure Defaults</h2><button type="button" data-default-close>Close</button></header><div class="departure-default-tabs" role="tablist" aria-label="Default settings"><button type="button" id="counter-default-tab" role="tab" aria-controls="departure-default-panel" aria-selected="true" data-default-section="counter">Counter</button><button type="button" id="gate-default-tab" role="tab" aria-controls="departure-default-panel" aria-selected="false" data-default-section="gate">Gate</button></div><p>Defaults are shared across new departure briefings. Existing briefings keep their saved settings.</p><p data-default-status role="status" aria-live="polite"></p><form><section id="departure-default-panel" role="tabpanel" aria-labelledby="counter-default-tab"></section><footer><button type="button" data-use-current>Use current settings</button><button type="submit" data-save-defaults>Save Counter defaults</button></footer></form>';
 document.body.append(dialog);
 const panel=dialog.querySelector('section'),status=dialog.querySelector('[data-default-status]'),save=dialog.querySelector('[data-save-defaults]'),use=dialog.querySelector('[data-use-current]'),close=dialog.querySelector('[data-default-close]'),tabs=[...dialog.querySelectorAll('[data-default-section]')];
 const keys={counter:Object.keys(BriefingFields.defaults).filter(key=>/^counterA\d+(Number|Service)$/.test(key)),gate:BriefingFields.gate.map(([key])=>key+'Label')};
 let section='counter',record=null,generation=0,busy=false,settings=new Map();
 const allowed=()=>getCurrent()?.canEditDepartureDefaults&&getCurrent()?.direction==='departure'&&getDirection()==='departure'&&!isQuick();
 const capture=()=>{const item=settings.get(section);if(item)for(const input of panel.querySelectorAll('[data-default-field]'))item.values[input.dataset.defaultField]=input.value;};
 function lock(value){busy=value;for(const element of dialog.querySelectorAll('button,input,textarea'))element.disabled=value;save.disabled=value||!settings.has(section);use.disabled=save.disabled;}
 function render(){
  panel.replaceChildren();for(const tab of tabs){const selected=tab.dataset.defaultSection===section;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}panel.setAttribute('aria-labelledby',section+'-default-tab');
  save.textContent='Save '+(section==='counter'?'Counter':'Gate')+' defaults';const item=settings.get(section);if(!item){lock(busy);return;}
  const field=(key,label)=>{const wrapper=document.createElement('label'),name=document.createElement('span'),input=document.createElement(key.endsWith('Number')?'input':'textarea');name.textContent=label;input.dataset.defaultField=key;input.setAttribute('aria-label',label);input.maxLength=150;if(input.tagName==='TEXTAREA')input.rows=2;input.value=item.values[key];wrapper.append(name,input);return wrapper;};
  if(section==='counter')for(let number=59;number<=68;number++){const row=document.createElement('div');row.className='counter-default-row';row.append(field('counterA'+number+'Number','A'+number+' counter number'),field('counterA'+number+'Service','A'+number+' service type'));panel.append(row);}
  else for(const [key,label] of BriefingFields.gate)panel.append(field(key+'Label',label+' position name'));
  status.textContent=item.dirty?'Unsaved '+section+' defaults.':item.updatedAt?'Saved by '+item.updatedBy+' · '+new Date(item.updatedAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles'}):'Edit these settings, then save this section.';lock(busy);
 }
 function dismiss(){generation++;dialog.close();record=null;settings.clear();busy=false;}
 close.onclick=dismiss;dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else{generation++;record=null;settings.clear();}});
 panel.addEventListener('input',()=>{const item=settings.get(section);if(item){item.dirty=true;status.textContent='Unsaved '+section+' defaults.';}});
 for(const tab of tabs)tab.onclick=()=>{capture();section=tab.dataset.defaultSection;render();};
 dialog.querySelector('[role=tablist]').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tab=event.key==='Home'?tabs[0]:event.key==='End'?tabs[1]:tabs[section==='counter'?1:0];tab.click();tab.focus();});
 use.onclick=()=>{const current=getCurrent();if(!allowed()||current!==record)return;const item=settings.get(section);item.values=Object.fromEntries(keys[section].map(key=>[key,String(current.fields[key]??BriefingFields.defaults[key])]));item.dirty=true;render();};
 button.onclick=async()=>{
  if(!allowed()||busy||isBusy())return;button.disabled=true;let run;
  try{if(!(await flush())||!allowed())return;record=getCurrent();run=++generation;section='counter';settings.clear();render();dialog.showModal();status.textContent='Loading defaults…';lock(true);
   const data=await Promise.all(['counter','gate'].map(section=>api('/departure-defaults?section='+section)));
   if(run!==generation||record!==getCurrent()||!allowed())return;for(const item of data)settings.set(item.section,item);lock(false);render();
  }catch(error){if(run===generation&&dialog.open)status.textContent=error.message;}finally{button.disabled=false;if(run===generation&&dialog.open)lock(false);}
 };
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();if(busy||!allowed()||record!==getCurrent()||isBusy())return;capture();const item=settings.get(section);if(!item)return;const run=generation,selected=section;lock(true);status.textContent='Saving defaults…';
  try{const result=await api('/departure-defaults',{section:selected,revision:item.revision,values:{...item.values}});if(run!==generation||record!==getCurrent()||!allowed())return;settings.set(selected,result);render();status.textContent=(selected==='counter'?'Counter':'Gate')+' defaults saved. New departure briefings will use these settings.';}
  catch(error){if(run===generation)status.textContent=error.message;}finally{if(run===generation)lock(false);}
 };
 return {update(){button.hidden=!allowed();if(dialog.open&&(!allowed()||record!==getCurrent()))dismiss();}};
};
