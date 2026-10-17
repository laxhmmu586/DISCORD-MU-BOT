(() => {
 const auth=window.firebase?.apps?.length&&firebase.auth(),status=document.querySelector('#profile-status'),form=document.querySelector('#profile-form');let data,avatar,dirty=false,saving=false;
 const field=id=>document.getElementById(id);
 function photo(value){field('profile-avatar').hidden=!value;field('profile-initials').hidden=Boolean(value);if(value)field('profile-avatar').src=value;else field('profile-avatar').removeAttribute('src');}
 function show(result){
  data=result;avatar=undefined;dirty=false;
  const p=data.profile;field('profile-content').hidden=false;field('profile-link').hidden=true;
  field('full-name').value=p.name;field('employee-id').value=p.eid;field('nickname').value=p.nickname;field('phone').value=p.phone;field('contact-email').value=p.email;
  field('profile-display-name').textContent=p.nickname||p.name;field('profile-full-name').textContent=p.name;field('profile-employee-id').textContent=p.eid||'—';field('profile-initials').textContent=(p.nickname||p.name||'?').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();photo(p.avatar);
  window.dispatchEvent(new CustomEvent('employee-profile-updated',{detail:p}));
 }
 function showLink(result){
  data=result;field('profile-link').hidden=false;field('profile-content').hidden=true;field('profile-eid-label').hidden=data.state!=='needs_eid';field('profile-eid').required=data.state==='needs_eid';
  const details=field('profile-link-details');details.replaceChildren();if(data.profile)for(const [label,key] of [['FULL NAME','name'],['昵称 / NICKNAME','nickname'],['EID','eid'],['PHONE NUMBER','phone'],['EMAIL','email']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=data.profile[key]||'—';details.append(dt,dd);}
  field('profile-link-form').querySelector('button').textContent=data.state==='needs_eid'?'Find employee':'Confirm information / 确认资料';
 }
 async function load(){status.textContent='Loading your profile…';try{const result=await employeeProfileApi();result.state==='ready'?show(result):showLink(result);status.textContent='';}catch(error){status.textContent=error.message;}}
 field('profile-link-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const result=data.state==='needs_eid'?await employeeProfileApi('/lookup',{eid:field('profile-eid').value.trim()}):await employeeProfileApi('/link',{eid:data.profile.eid,revision:data.revision});result.state==='ready'?show(result):showLink(result);status.textContent='';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
 field('avatar-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('Choose a PNG, JPEG or WebP image up to 2 MB.');avatar=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Unable to read image.'));reader.readAsDataURL(file);});photo(avatar);dirty=true;status.textContent='Photo selected. Save changes to update your profile.';}catch(error){status.textContent=error.message;}finally{event.target.value='';}};
 field('remove-avatar').onclick=()=>{avatar='';photo('');dirty=true;status.textContent='Photo removed. Save changes to update your profile.';};
 field('reload-profile').onclick=load;form.oninput=()=>{dirty=true;status.textContent='Unsaved changes';};
 form.onsubmit=async event=>{event.preventDefault();if(saving)return;saving=true;form.querySelectorAll('button,input').forEach(el=>el.disabled=true);field('avatar-file').disabled=true;try{const body={revision:data.revision,nickname:field('nickname').value,phone:field('phone').value,email:field('contact-email').value};if(avatar!==undefined)body.avatar=avatar;show(await employeeProfileApi('',body));status.textContent='Profile saved / 个人资料已保存';}catch(error){status.textContent=error.message;}finally{saving=false;form.querySelectorAll('button,input').forEach(el=>el.disabled=false);field('avatar-file').disabled=false;}};
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 if(!auth){status.textContent='Unable to initialize sign-in. Please reload.';return;}auth.onAuthStateChanged(user=>user?load():location.replace('/login.html'));
})();
