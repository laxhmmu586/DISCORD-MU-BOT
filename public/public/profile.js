(() => {
 const auth=window.firebase?.apps?.length&&firebase.auth(),status=document.querySelector('#profile-status'),form=document.querySelector('#profile-form');let data,avatar,dirty=false,saving=false;
 const field=id=>document.getElementById(id);
 field('phone').addEventListener('blur',()=>{field('phone').value=window.formatEmployeePhone(field('phone').value);});
 const editor=field('profile-edit-dialog');
 new MutationObserver(()=>{field('profile-edit-status').textContent=status.textContent;}).observe(status,{childList:true,characterData:true,subtree:true});
 function openEditor(){if(!data?.profile)return;if(!dirty)status.textContent='';if(!editor.open)editor.showModal();field('nickname').focus();}
 field('edit-profile').onclick=openEditor;field('edit-personal').onclick=openEditor;
 field('close-profile-edit').onclick=()=>{if(saving)return;show(data);status.textContent='';editor.close();};
 editor.oncancel=event=>{if(saving){event.preventDefault();return;}show(data);status.textContent='';};
 function photo(value){field('profile-avatar').hidden=!value;field('profile-initials').hidden=Boolean(value);if(value)field('profile-avatar').src=value;else field('profile-avatar').removeAttribute('src');}
 function show(result){
  data=result;avatar=undefined;dirty=false;
  const p=data.profile;p.phone=window.formatEmployeePhone(p.phone);field('profile-content').hidden=false;field('profile-link').hidden=true;
  field('full-name').value=p.name;field('employee-id').value=p.eid;field('nickname').value=p.nickname;field('phone').value=p.phone;field('contact-email').value=p.email;
  for(const [id,key] of [['view-full-name','name'],['view-employee-id','eid'],['view-nickname','nickname'],['view-phone','phone'],['view-email','email']])field(id).textContent=p[key]||'—';
  for(const key of ['station','account','pbbId','pbbExpiry']){field(key).value=p[key]||'';field('view-'+key).textContent=p[key]||'—';}
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),qualification=pbbQualificationStatus(p.pbbExpiry,today),expired=qualification==='expired',warning=qualification==='warning';for(const id of ['view-pbbExpiry','pbbExpiry']){field(id).classList.toggle('has-expired',expired);field(id).classList.toggle('has-warning',warning);}field('profile-pbb-warning').hidden=!expired&&!warning;field('profile-pbb-warning').className=expired?'has-expired':'has-warning';field('profile-pbb-warning').textContent=expired?'PBB qualification expired — cannot drive PBB.':'Warning: PBB qualification expires in less than 1 month.';
  field('profile-has-dashboard').hidden=(auth.currentUser?.email||'').trim().toLowerCase()!=='lake@mu.com';
  field('profile-display-name').textContent=p.nickname||p.name;field('profile-full-name').textContent=p.name;field('profile-employee-id').textContent=p.eid||'—';field('profile-initials').textContent=(p.nickname||p.name||'?').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();photo(p.avatar);
  window.dispatchEvent(new CustomEvent('employee-profile-updated',{detail:p}));
 }
 function showLink(result){
  data=result;field('profile-link').hidden=false;field('profile-content').hidden=true;field('profile-eid-label').hidden=data.state!=='needs_eid';field('profile-eid').required=data.state==='needs_eid';
  const details=field('profile-link-details');details.replaceChildren();if(data.profile)for(const [label,key] of [['FULL NAME','name'],['NICKNAME','nickname'],['EID','eid'],['PHONE NUMBER','phone'],['EMAIL','email']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=data.profile[key]||'—';details.append(dt,dd);}
  field('profile-link-form').querySelector('button').textContent=data.state==='needs_eid'?'Find employee':'Confirm information';
 }
 async function load(){status.textContent='Loading your profile…';try{const result=await employeeProfileApi();if(result.state==='external'){field('profile-content').hidden=true;field('profile-link').hidden=true;status.textContent='External employee account · No employee ID verification is required.';return;}result.state==='ready'?show(result):showLink(result);status.textContent='';}catch(error){status.textContent=error.message;}}
 field('profile-link-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const result=data.state==='needs_eid'?await employeeProfileApi('/lookup',{eid:field('profile-eid').value.trim()}):await employeeProfileApi('/link',{eid:data.profile.eid,revision:data.revision});result.state==='ready'?show(result):showLink(result);status.textContent='';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
 field('avatar-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('Choose a PNG, JPEG or WebP image up to 2 MB.');avatar=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Unable to read image.'));reader.readAsDataURL(file);});photo(avatar);dirty=true;status.textContent='Photo selected. Save changes to update your profile.';openEditor();}catch(error){status.textContent=error.message;}finally{event.target.value='';}};
 field('remove-avatar').onclick=()=>{avatar='';photo('');dirty=true;status.textContent='Photo removed. Save changes to update your profile.';};
 field('reload-profile').onclick=load;form.oninput=()=>{dirty=true;status.textContent='Unsaved changes';};
 form.onsubmit=async event=>{event.preventDefault();if(saving)return;saving=true;form.querySelectorAll('button,input').forEach(el=>el.disabled=true);field('avatar-file').disabled=true;try{const body={revision:data.revision,nickname:field('nickname').value,phone:window.formatEmployeePhone(field('phone').value),email:field('contact-email').value};if(avatar!==undefined)body.avatar=avatar;show(await employeeProfileApi('',body));status.textContent='Profile saved';editor.close();}catch(error){status.textContent=error.message;}finally{saving=false;form.querySelectorAll('button,input').forEach(el=>el.disabled=false);field('avatar-file').disabled=false;}};
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 if(!auth){status.textContent='Unable to initialize sign-in. Please reload.';return;}auth.onAuthStateChanged(user=>{if(user&&/^[^@\s]+@mu\.com$/i.test(user.email||'')&&(user.email||'').trim().toLowerCase()!=='lake@mu.com'){location.replace('/flights.html');return;}field('profile-admin-nav').hidden=!['lake@mu.com','tamsun@hm.com','nextweek1216@gmail.com','tamsun10@gmail.com'].includes(user?.email?.toLowerCase());user?load():location.replace('/login.html');});
})();
