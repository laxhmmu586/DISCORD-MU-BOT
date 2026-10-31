(()=>{
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;},api=(path,body)=>peopleApi('/staff-schedule-api'+path,body);
 const icon='<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M5 12h6l13-6v20l-13-6H5zM8 21l3 8h5l-3-8z"/><path d="m27 10 3-2m-3 8h4m-4 6 3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
 let retry=null,state=null,items=[],generation=0,active=null;
 const banner=el('button',undefined,'schedule-announcement-banner');banner.id='schedule-announcement-banner';banner.type='button';banner.hidden=true;banner.innerHTML='<span class="announcement-megaphone">'+icon+'</span><span></span><b aria-hidden="true">›</b>';$('schedule-content').prepend(banner);
 const publish=el('button','+ Announcement');publish.id='publish-announcement';publish.hidden=true;if($('schedule-add-edit-panel'))$('schedule-add-edit-panel').append(publish);else $('refresh').before(publish);
 const modal=el('dialog',undefined,'announcement-dialog');modal.id='announcement-dialog';modal.setAttribute('aria-labelledby','announcement-title');modal.innerHTML='<button type="button" class="announcement-close" aria-label="Close announcement">×</button><span class="announcement-megaphone">'+icon+'</span><h2 id="announcement-title"></h2><p id="announcement-message"></p><p id="announcement-error" role="status"></p><button type="button" id="announcement-got-it">Got it</button>';document.body.append(modal);
 modal.querySelector('.announcement-close').onclick=()=>modal.close();banner.onclick=()=>{active=items[0];if(!active)return;$('announcement-title').textContent=active.title;$('announcement-message').textContent=active.body;$('announcement-error').textContent='';modal.showModal();};
 function render(){banner.hidden=!state||state.canEdit||!items.length;banner.querySelector('span:nth-child(2)').textContent='You have '+items.length+' new announcement'+(items.length===1?'':'s');}
 $('announcement-got-it').onclick=async()=>{const item=active,run=generation;if(!item)return;$('announcement-got-it').disabled=true;try{await api('/announcements/read',{id:item.id});if(run!==generation)return;items=items.filter(row=>row.id!==item.id);modal.close();render();}catch(error){$('announcement-error').textContent=error.message;}finally{$('announcement-got-it').disabled=false;}};
 const composer=el('dialog',undefined,'schedule-dialog');composer.id='announcement-composer';composer.innerHTML='<form><h2>Publish announcement</h2><label>Date<input id="announcement-date" type="date" required></label><label>Visible through<input id="announcement-expires" type="date" required><small>Until 11:59 PM Los Angeles time on this date.</small></label><label>Title<input id="announcement-heading" maxlength="120" required></label><label>Message<textarea id="announcement-body" maxlength="4000" rows="5" required></textarea></label><p id="announcement-publish-error" role="status"></p><div class="dialog-actions"><button type="button" id="announcement-cancel">Cancel</button><button type="submit">Publish</button></div></form><section id="announcement-management"><h3>Published announcements</h3><div id="announcement-management-list"></div></section>';document.body.append(composer);
 publish.onclick=()=>{$('announcement-date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('announcement-expires').min=$('announcement-date').value;$('announcement-expires').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000));$('announcement-publish-error').textContent='';composer.showModal();void loadManagement();};$('announcement-cancel').onclick=()=>composer.close();composer.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await api('/announcements',{date:$('announcement-date').value,title:$('announcement-heading').value,body:$('announcement-body').value,expiresOn:$('announcement-expires').value});composer.close();$('schedule-status').textContent='Announcement published.';}catch(error){$('announcement-publish-error').textContent=error.message;}finally{button.disabled=false;}};
 async function loadManagement(){const host=$('announcement-management-list'),run=generation;host.textContent='Loading…';try{const result=await api('/announcements/manage');if(run!==generation)return;host.replaceChildren();for(const item of result.announcements){const row=el('article',undefined,'announcement-management-row'),remove=el('button','Delete');remove.type='button';remove.onclick=async()=>{remove.disabled=true;try{await api('/announcements/'+encodeURIComponent(item.id)+'/delete',{});await loadManagement();}catch(error){$('announcement-publish-error').textContent=error.message;remove.disabled=false;}};row.append(el('strong',item.title),el('p',(Date.parse(item.expiresAt)<=Date.now()?'Expired · ':'Expires · ')+new Date(item.expiresAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles'})+' PT'),remove);host.append(row);}if(!result.announcements.length)host.textContent='No published announcements.';}catch(error){host.textContent=error.message;}}
 setInterval(()=>{const remaining=items.filter(item=>!item.expiresAt||Date.parse(item.expiresAt)>Date.now());if(remaining.length!==items.length){items=remaining;if(active?.expiresAt&&Date.parse(active.expiresAt)<=Date.now()){modal.close();active=null;}render();}},1000);
 const shortFields=el('fieldset');shortFields.id='shortage-positions';shortFields.hidden=true;shortFields.append(el('legend','Short positions / headcount'));$('date-labels').closest('label').after(shortFields);
 const modeControl=()=>{const label=el('label','Requirement'),select=el('select');select.id='shortage-mode';select.setAttribute('aria-label','Shortage requirement');select.append(new Option('All selected positions (AND)','and'),new Option('Any one option (OR)','or'));select.value=shortMode;select.onchange=()=>{shortMode=select.value;};label.className='shortage-mode-control';label.append(select);return label;};let shortMode='and';
 window.scheduleShortageMode=()=>isShort()?shortMode:'and';
 const isShort=()=>$('date-labels').value.split(',').some(label=>label.trim().toLowerCase()==='short');$('date-labels').addEventListener('input',()=>shortFields.hidden=!isShort());const shortButton=el('button','Short');shortButton.type='button';shortButton.onclick=()=>{const labels=$('date-labels').value.split(',').map(v=>v.trim()).filter(Boolean);if(!isShort())labels.push('Short');$('date-labels').value=labels.join(', ');shortFields.hidden=false;};document.querySelector('.date-label-presets').append(shortButton);
 window.scheduleShortageSelection=()=>isShort()?[...shortFields.querySelectorAll('button[aria-pressed="true"]')].map(button=>({code:button.dataset.shortCode,count:Number(button.parentElement.querySelector('input').value)})):[];
 window.addEventListener('schedule-date-open',event=>{shortMode=event.detail.shortRoleMode||'and';shortFields.replaceChildren(el('legend','Short positions / headcount'),modeControl());const list=el('div',undefined,'shortage-positions-grid');shortFields.append(list);for(const [code,name] of Object.entries(state?.roles||{})){if(['X','VAC','N','CS','CO'].includes(code))continue;const row=el('div',undefined,'shortage-position-compact'),button=el('button',code),count=el('input'),existing=event.detail.shortRoles?.find(item=>item.code===code);button.type='button';button.title=name;button.dataset.shortCode=code;button.setAttribute('aria-label','Short '+code);count.type='number';count.min='1';count.max='99';count.value=existing?.count||'';count.placeholder='0';count.setAttribute('aria-label',code+' shortage count');const select=on=>{button.setAttribute('aria-pressed',String(on));button.style.backgroundColor=on?state.colors[code]||'#e3ecfc':'#f1f5fa';button.style.color='#173b63';};select(Boolean(existing));button.onclick=()=>{const on=button.getAttribute('aria-pressed')!=='true';select(on);count.value=on?(Number(count.value)>0?count.value:1):'';if(on)count.focus();};count.oninput=()=>select(Number(count.value)>0);row.append(button,count);list.append(row);}shortFields.hidden=!isShort();});
 async function refreshAnnouncements(){if(!state||state.canEdit)return;clearTimeout(retry);const run=generation;try{const result=await api('/announcements');if(run!==generation)return;if(JSON.stringify(items)!==JSON.stringify(result.announcements)){items=result.announcements;render();}}catch{if(run===generation)retry=setTimeout(()=>void refreshAnnouncements(),5000);}}
 window.addEventListener('schedule-live-update',()=>void refreshAnnouncements());
 window.addEventListener('schedule-state',event=>{const changed=state?.employeeId!==event.detail?.employeeId||state?.canEdit!==event.detail?.canEdit;state=event.detail;if(!changed)return;clearTimeout(retry);generation++;publish.hidden=!state?.canEdit;if(!state){items=[];banner.hidden=true;modal.close();composer.close();return;}if(state.canEdit){items=[];render();return;}void refreshAnnouncements();});
})();

// Persistent schedule policy, separate from expiring announcements.
(()=>{
 const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const card=make('section');card.id='schedule-standing-notice';card.className='schedule-standing-notice';card.hidden=true;card.setAttribute('aria-labelledby','standing-notice-title');
 const heading=make('div'),title=make('h2','Notice'),edit=make('button','Edit');title.id='standing-notice-title';edit.type='button';edit.hidden=true;heading.className='standing-notice-heading';heading.append(title,edit);
 const content=make('div'),status=make('p');status.setAttribute('role','status');status.className='standing-notice-status';card.append(heading,content,status);document.getElementById('clock-in-time').before(card);
 const dialog=make('dialog');dialog.className='schedule-dialog';dialog.setAttribute('aria-labelledby','standing-notice-edit-title');
 dialog.innerHTML='<form><h2 id="standing-notice-edit-title">Edit Notice</h2><label>Reminders<textarea rows="9" maxlength="4000" required></textarea></label><p>One reminder per line. Use **text** for bold text.</p><p role="status"></p><div class="dialog-actions"><button type="button">Cancel</button><button type="submit">Save</button></div></form>';document.body.append(dialog);
 const form=dialog.querySelector('form'),input=dialog.querySelector('textarea'),error=dialog.querySelector('[role=status]'),cancel=dialog.querySelector('[type=button]'),save=dialog.querySelector('[type=submit]');
 let state=null,notice=null,epoch=0,request=0,editingRevision=0;
 const api=body=>peopleApi('/staff-schedule-api/notice',body);
 function render(){
  content.replaceChildren();
  const list=make('ul');
  for(const line of notice.body.split(/\r?\n/).filter(line=>line.trim())){
   const item=make('li');
   for(const [i,part] of line.split(/\*\*(.+?)\*\*/g).entries())item.append(i%2?make('strong',part):document.createTextNode(part));
   list.append(item);
  }
  content.append(list);edit.hidden=!state?.canEdit;
 }
 async function refresh(){
  if(!state)return;
  const run=++request,session=epoch;
  try{const result=await api();if(session!==epoch||run!==request)return;notice=result.notice;status.textContent='';render();}
  catch(e){if(session===epoch&&run===request)status.textContent='Unable to load Notice. '+e.message;}
 }
 edit.onclick=()=>{if(!state?.canEdit||!notice)return;editingRevision=notice.revision;input.value=notice.body;error.textContent='';dialog.showModal();};
 cancel.onclick=()=>{dialog.close();void refresh();};
 form.onsubmit=async event=>{
  event.preventDefault();if(!state?.canEdit)return;
  const session=epoch;save.disabled=true;error.textContent='';
  try{const result=await api({body:input.value,revision:editingRevision});if(session!==epoch)return;request++;notice=result.notice;render();dialog.close();status.textContent='Notice saved.';}
  catch(e){if(session===epoch)error.textContent=e.message;}
  finally{save.disabled=false;}
 };
 window.addEventListener('schedule-state',event=>{
  const next=event.detail,changed=state?.employeeId!==next?.employeeId||state?.canEdit!==next?.canEdit;state=next;
  if(changed){epoch++;request++;dialog.close();notice=null;content.replaceChildren();status.textContent='';}
  card.hidden=!state;edit.hidden=!state?.canEdit||!notice;
  if(state)void refresh();
 });
 window.addEventListener('schedule-live-update',()=>void refresh());
})();
