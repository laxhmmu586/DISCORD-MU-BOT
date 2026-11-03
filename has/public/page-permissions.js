(() => {
 const button=document.querySelector('[data-page-permissions]');
 const auth=window.firebase?.apps?.length&&firebase.auth();
 if(!button||!auth)return;
 const path=button.dataset.pagePermissions;
 const request=(body)=>window.peopleApi?peopleApi(path,body):apiJson(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const dialog=document.createElement('dialog');
 dialog.className='page-permission-dialog';
 dialog.setAttribute('aria-labelledby','page-permission-title');
 dialog.innerHTML='<form><header><h2 id="page-permission-title">Page permissions</h2><button type="button" aria-label="Close permissions">×</button></header><label class="permission-private"><input type="checkbox" name="restricted"> Private page</label><p>Choose the roles or people who can view this page. Site owners retain management access.</p><div class="permission-audience"><fieldset><legend>Roles</legend><div></div></fieldset><fieldset><legend>People</legend><input type="search" placeholder="Search people" aria-label="Search people"><div></div></fieldset></div><p role="status" aria-live="polite"></p><footer><button type="submit">Save permissions</button></footer></form>';
 document.body.append(dialog);
 const form=dialog.querySelector('form'),restricted=form.elements.restricted,search=dialog.querySelector('[type=search]');
 const [roles,members]=dialog.querySelectorAll('fieldset div');
 const status=dialog.querySelector('[role=status]'),save=dialog.querySelector('[type=submit]');
 let revision;
 function choices(container,options,selected,name){
  container.replaceChildren(...options.map(({id,label})=>{
   const row=document.createElement('label'),input=document.createElement('input');
   input.type='checkbox';input.name=name;input.value=id;input.checked=selected.includes(id);
   row.append(input,document.createTextNode(label));return row;
  }));
 }
 function render(data){
  revision=data.revision;restricted.checked=data.restricted;
  choices(roles,data.roleOptions.map(role=>({id:role,label:role})),data.roles,'roles');
  const people=data.memberOptions.map(member=>({id:member.id,label:[member.name,[member.station,member.account].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}));
  choices(members,people,data.members,'members');
  search.value='';search.oninput();restricted.onchange();
 }
 restricted.onchange=()=>{for(const field of dialog.querySelectorAll('fieldset'))field.disabled=!restricted.checked;};
 search.oninput=()=>{for(const row of members.children)row.hidden=!row.textContent.toLowerCase().includes(search.value.trim().toLowerCase());};
 dialog.querySelector('header button').onclick=()=>dialog.close();
 button.onclick=async()=>{
  dialog.showModal();status.textContent='Loading permissions…';save.disabled=true;
  try{render(await request());status.textContent='';save.disabled=false;}catch(error){status.textContent=error.message;}
 };
 form.onsubmit=async event=>{
  event.preventDefault();
  const data=new FormData(form);
  save.disabled=true;
  try{render(await request({revision,restricted:restricted.checked,roles:data.getAll('roles'),members:data.getAll('members')}));status.textContent='Permissions saved.';}
  catch(error){status.textContent=error.message;}
  finally{save.disabled=false;}
 };
 auth.onAuthStateChanged(async user=>{
  button.hidden=true;if(dialog.open)dialog.close();if(!user)return;
  try{await request();if(auth.currentUser===user)button.hidden=false;}catch{}
 });
})();
