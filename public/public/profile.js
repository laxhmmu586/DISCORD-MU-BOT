(() => {
 const auth=window.firebase?.apps?.length&&firebase.auth(),status=document.querySelector('#profile-status'),form=document.querySelector('#profile-form'),adminEmails=new Set(['lake@mu.com','nextweek1216@gmail.com','tamsun10@gmail.com']);let data,avatar,dirty=false,saving=false;
 const field=id=>document.getElementById(id);
 const editor=field('profile-edit-dialog');
 new MutationObserver(()=>{field('profile-edit-status').textContent=status.textContent;}).observe(status,{childList:true,characterData:true,subtree:true});
 function openEditor(){if(!data?.profile)return;if(!dirty)status.textContent='';if(!editor.open)editor.showModal();field('nickname').focus();}
 field('edit-profile').onclick=openEditor;
 field('close-profile-edit').onclick=()=>{if(saving)return;show(data);status.textContent='';editor.close();};
 editor.oncancel=event=>{if(saving){event.preventDefault();return;}show(data);status.textContent='';};
 function photo(value){field('profile-avatar').hidden=!value;field('profile-initials').hidden=Boolean(value);if(value)field('profile-avatar').src=value;else field('profile-avatar').removeAttribute('src');}
 function show(result){
  data=result;avatar=undefined;dirty=false;
  const p=data.profile;p.phone=window.formatEmployeePhone(p.phone);field('profile-content').hidden=false;field('profile-link').hidden=true;
  field('profile-admin-nav').hidden=!(adminEmails.has((auth.currentUser?.email||'').trim().toLowerCase())||['Business Manager','Manager','Supervisor'].includes(p.position));
  field('full-name').value=p.name;field('nickname').value=p.nickname;
  for(const key of ['station','account','pbbId','pbbExpiry','pbbMscId','pbbMscExpiry']){field(key).value=p[key]||'';if(field('view-'+key))field('view-'+key).textContent=p[key]||'—';}
  document.querySelectorAll('[data-msc-profile]').forEach(el=>el.hidden=p.station!=='LAX');field('profile-pbb-label').textContent=p.station==='LAX'?'TBIT PBB ID':'PBB ID';
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),notices=[];
  for(const key of p.station==='LAX'?['pbbExpiry','pbbMscExpiry']:['pbbExpiry']){const state=pbbQualificationStatus(p[key],today),name=p.station==='LAX'?(key==='pbbExpiry'?'TBIT':'MSC')+' ':'';for(const id of ['view-'+key,key]){field(id).classList.toggle('has-expired',state==='expired');field(id).classList.toggle('has-warning',state==='warning');}if(state)notices.push({state,text:state==='expired'?name+'PBB qualification expired — cannot drive PBB.':name+'PBB qualification expires in less than 1 month.'});}
  field('profile-pbb-warning').hidden=!notices.length;field('profile-pbb-warning').className=notices.some(n=>n.state==='expired')?'has-expired':'has-warning';field('profile-pbb-warning').textContent=notices.map(n=>n.text).join(' ');
  field('profile-has-dashboard').hidden=!['lake@mu.com','demo@hm.com'].includes((auth.currentUser?.email||'').trim().toLowerCase());
  field('profile-display-name').textContent=p.nickname||p.name;field('profile-full-name').textContent=p.name;field('profile-initials').textContent=(p.nickname||p.name||'?').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();photo(p.avatar);
  window.dispatchEvent(new CustomEvent('employee-profile-updated',{detail:p}));
 }
 function showLink(result){
  data=result;field('profile-link').hidden=false;field('profile-content').hidden=true;
  const select=field('profile-main-account');field('profile-main-account-label').hidden=false;select.required=true;select.replaceChildren(new Option('Select Account',''));for(const scope of data.accounts||(data.profile?[{station:data.profile.station,account:data.profile.account}]:[]))select.add(new Option(scope.station+' / '+scope.account,JSON.stringify(scope)));
  field('profile-link-details').replaceChildren();field('profile-link-form').querySelector('button').textContent='Continue';
 }
 async function load(){status.textContent='Loading your profile…';try{const result=await employeeProfileApi();if(result.state==='external'){field('profile-content').hidden=true;field('profile-link').hidden=true;status.textContent='External employee account · No employee ID verification is required.';return;}result.state==='ready'?show(result):showLink(result);status.textContent='';}catch(error){status.textContent=error.message;}}
 field('profile-link-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const result=await employeeProfileApi('/select-account',{revision:data.revision,...JSON.parse(field('profile-main-account').value)});result.state==='ready'?show(result):showLink(result);status.textContent='';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
 field('avatar-file').onchange=async event=>{const file=event.target.files[0];if(!file||saving)return;try{const cropped=await ProfileAvatarCropper.crop(file);if(cropped===null)return;avatar=cropped;photo(avatar);dirty=true;status.textContent='Photo cropped. Save changes to update your profile.';openEditor();}catch(error){status.textContent=error.message;}finally{event.target.value='';}};
 field('choose-avatar').onclick=()=>field('avatar-file').click();
 field('remove-avatar').onclick=()=>{avatar='';photo('');dirty=true;status.textContent='Photo removed. Save changes to update your profile.';};
 field('reload-profile').onclick=load;form.oninput=()=>{dirty=true;status.textContent='Unsaved changes';};
 form.onsubmit=async event=>{event.preventDefault();if(saving)return;saving=true;form.querySelectorAll('button,input').forEach(el=>el.disabled=true);field('avatar-file').disabled=true;try{const body={revision:data.revision,nickname:field('nickname').value};if(avatar!==undefined)body.avatar=avatar;show(await employeeProfileApi('',body));status.textContent='Profile saved';editor.close();}catch(error){status.textContent=error.message;}finally{saving=false;form.querySelectorAll('button,input').forEach(el=>el.disabled=false);field('avatar-file').disabled=false;}};
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 if(!auth){status.textContent='Unable to initialize sign-in. Please reload.';return;}auth.onAuthStateChanged(user=>{if(user&&/^[^@\s]+@mu\.com$/i.test(user.email||'')&&(user.email||'').trim().toLowerCase()!=='lake@mu.com'){location.replace('/flights.html');return;}field('profile-admin-nav').hidden=!adminEmails.has(user?.email?.toLowerCase());user?load():location.replace('/login.html');});
})();
