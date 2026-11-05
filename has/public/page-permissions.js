(() => {
 const workspace=document.body.dataset.workspacePage;
 let button=document.querySelector('[data-page-permissions]');
 if(workspace&&!button){
  button=document.createElement('button');
  button.type='button';button.hidden=true;button.textContent='Permissions';
  button.dataset.pagePermissions='/has-page-api/'+workspace+'/permissions';
  button.className='workspace-permission-button';
  document.body.append(button);
 }
 const auth=window.firebase?.apps?.length&&firebase.auth();
 if(!button||!auth){
  const notice=document.querySelector('.workspace-permission-notice');
  if(notice)notice.textContent='Unable to initialize sign-in. Please reload.';
  else document.body.removeAttribute('data-permission-pending');
  return;
 }
 const path=button.dataset.pagePermissions;
 async function request(body,endpoint=path){
  const user=auth.currentUser;if(!user)throw Error('Sign in required.');
  const base=(window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'');
  const response=await fetch(base+endpoint,{cache:'no-store',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+await user.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error((await response.json().catch(()=>({}))).error||'Page permissions are unavailable.');
  return response.json();
 }
 if(workspace){
  const notice=document.querySelector('.workspace-permission-notice')||document.createElement('p');
  notice.className='workspace-permission-notice';notice.setAttribute('role','status');
  notice.textContent='Checking page access...';document.body.append(notice);
  auth.onAuthStateChanged(async user=>{
   if(!user){document.body.removeAttribute('data-permission-pending');notice.hidden=true;return;}
   document.body.dataset.permissionPending='';notice.hidden=false;
   try{
    const result=await request(undefined,'/has-page-api/'+workspace+'/access');
    if(auth.currentUser!==user)return;
    if(result.canAccess){document.body.removeAttribute('data-permission-pending');notice.hidden=true;}
    else notice.textContent='You do not have permission to view this page.';
   }catch{if(auth.currentUser===user)notice.textContent='Page access could not be verified. Reload to try again.';}
  });
 }
 const dialog=document.createElement('dialog');
 dialog.className='page-permission-dialog';
 dialog.setAttribute('aria-labelledby','page-permission-title');
 dialog.innerHTML=`<form>
  <aside class="permission-sidebar">
   <div><h2 id="page-permission-title">Page permissions</h2><p>Manage page access</p></div>
   <nav role="tablist" aria-label="Permission audience">
    <button type="button" role="tab" id="permission-roles-tab" aria-controls="permission-roles" aria-selected="true" data-audience="roles"><span class="permission-nav-icon" aria-hidden="true">R</span><span><strong>Roles</strong><small>Access by employee role</small></span><b></b></button>
    <button type="button" role="tab" id="permission-accounts-tab" aria-controls="permission-accounts" aria-selected="false" tabindex="-1" data-audience="accounts"><span class="permission-nav-icon" aria-hidden="true">A</span><span><strong>Account</strong><small>Access by station and account</small></span><b></b></button>
    <button type="button" role="tab" id="permission-members-tab" aria-controls="permission-members" aria-selected="false" tabindex="-1" data-audience="members"><span class="permission-nav-icon" aria-hidden="true">P</span><span><strong>People</strong><small>Access for individual employees</small></span><b></b></button>
   </nav>
   <button type="button" class="permission-discard">Discard edits</button>
  </aside>
  <section class="permission-main">
   <header><span>PAGE ACCESS</span><button type="button" class="permission-close" aria-label="Close permissions">×</button></header>
   <div class="permission-heading"><span class="permission-avatar" aria-hidden="true">R</span><h3>Roles</h3><p>Choose the employee roles that can view this page.</p><span class="permission-page-name"></span></div>
   <label class="permission-private"><span><strong>Private page</strong><small>Only selected roles, accounts or people can view this page.</small></span><input type="checkbox" name="restricted" class="permission-switch" role="switch"></label>
   <p class="permission-help">Select any matching role, account or person to grant page access.</p>
   <label class="permission-search"><span class="permission-search-label">Search roles</span><input type="search" placeholder="Search roles" aria-label="Search roles"></label>
   <div class="permission-audience">
    <section id="permission-roles" role="tabpanel" aria-labelledby="permission-roles-tab"><fieldset><legend class="permission-sr-only">Roles with page access</legend><div></div></fieldset></section>
    <section id="permission-accounts" role="tabpanel" aria-labelledby="permission-accounts-tab" hidden><fieldset><legend class="permission-sr-only">Accounts with page access</legend><div></div></fieldset></section>
    <section id="permission-members" role="tabpanel" aria-labelledby="permission-members-tab" hidden><fieldset><legend class="permission-sr-only">People with page access</legend><div></div></fieldset></section>
   </div>
   <p class="permission-status" role="status" aria-live="polite"></p>
   <footer><button type="submit">Save permissions</button></footer>
  </section>
 </form>`;
 document.body.append(dialog);
 const form=dialog.querySelector('form'),restricted=form.elements.restricted,search=dialog.querySelector('[type=search]');
 const tabs=[...dialog.querySelectorAll('[role=tab]')];
 const panels=[...dialog.querySelectorAll('[role=tabpanel]')];
 const containers=Object.fromEntries(tabs.map((tab,index)=>[tab.dataset.audience,panels[index].querySelector('fieldset div')]));
 const status=dialog.querySelector('[role=status]'),save=dialog.querySelector('[type=submit]');
 const help=dialog.querySelector('.permission-help');
 const copy={
  roles:{title:'Roles',description:'Choose the employee roles that can view this page.',search:'Search roles'},
  accounts:{title:'Account',description:'Grant access to employees assigned to a station and account.',search:'Search accounts'},
  members:{title:'People',description:'Choose individual employees who can view this page.',search:'Search people'}
 };
 let revision,active='roles',busy=true,requestId=0;
 const accountKey=account=>JSON.stringify([account.station,account.account]);
 function counts(){
  for(const tab of tabs)tab.querySelector('b').textContent=containers[tab.dataset.audience].querySelectorAll('input:checked').length;
 }
 function filter(){
  const query=search.value.trim().toLowerCase();
  const container=containers[active];
  for(const row of container.children)row.hidden=!row.textContent.toLowerCase().includes(query);
  const empty=container.parentElement.querySelector('.permission-empty');
  if(empty)empty.hidden=[...container.children].some(row=>!row.hidden);
 }
 function selectTab(name){
  active=name;
  for(const tab of tabs){const selected=tab.dataset.audience===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
  for(const panel of panels)panel.hidden=panel.id!=='permission-'+name;
  const current=copy[name];
  dialog.querySelector('.permission-avatar').textContent=current.title[0];
  dialog.querySelector('.permission-heading h3').textContent=current.title;
  dialog.querySelector('.permission-heading p').textContent=current.description;
  dialog.querySelector('.permission-search-label').textContent=current.search;
  search.placeholder=current.search;search.setAttribute('aria-label',current.search);search.value='';filter();
 }
 function controls(){
  restricted.disabled=busy;search.disabled=busy;save.disabled=busy;
  for(const field of dialog.querySelectorAll('fieldset'))field.disabled=busy||!restricted.checked;
  help.textContent=restricted.checked?'A matching role, account or person grants page access. Account access includes primary and additional assignments.':'This page uses its default access rules. Turn on Private page to choose who can view it.';
 }
 function choices(container,options,selected,name){
  const known=new Set(options.map(option=>option.id));
  options=[...options,...selected.filter(id=>!known.has(id)).map(id=>({id,label:id,detail:'Saved selection'}))];
  container.replaceChildren(...options.map(({id,label,detail:description})=>{
   const row=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small'),control=document.createElement('span'),state=document.createElement('b');
   row.className='permission-row';
   input.type='checkbox';input.name=name;input.value=id;input.checked=selected.includes(id);input.className='permission-switch';input.setAttribute('role','switch');
   title.textContent=label;detail.textContent=description||'';
   text.append(title,detail);control.className='permission-control';control.append(state,input);
   const update=()=>{state.textContent=input.checked?'Allowed':'Not allowed';state.classList.toggle('is-allowed',input.checked);};
   input.onchange=()=>{update();counts();};update();row.append(text,control);return row;
  }));
  let empty=container.parentElement.querySelector('.permission-empty');
  if(!empty){empty=document.createElement('p');empty.className='permission-empty';container.after(empty);}
  empty.textContent='No matching '+copy[name].title.toLowerCase()+'.';
 }
 function render(data){
  revision=data.revision;restricted.checked=data.restricted;
  choices(containers.roles,data.roleOptions.map(role=>({id:role,label:role,detail:'Employee role'})),data.roles,'roles');
  choices(containers.accounts,(data.accountOptions||[]).map(account=>({id:accountKey(account),label:account.station+' / '+account.account,detail:'Primary or additional account assignment'})),(data.accounts||[]).map(accountKey),'accounts');
  const people=data.memberOptions.map(member=>({id:member.id,label:member.name,detail:[member.station,member.account].filter(Boolean).join(' / ')}));
  choices(containers.members,people,data.members,'members');
  counts();selectTab(active);controls();
 }
 restricted.onchange=controls;
 search.oninput=filter;
 search.onkeydown=event=>{if(event.key==='Enter')event.preventDefault();};
 for(const tab of tabs){
  tab.onclick=()=>selectTab(tab.dataset.audience);
  tab.onkeydown=event=>{
   const index=tabs.indexOf(tab);
   const step={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1}[event.key];
   let next;
   if(event.key==='Home')next=0;
   else if(event.key==='End')next=tabs.length-1;
   else if(step)next=(index+step+tabs.length)%tabs.length;
   else return;
   event.preventDefault();selectTab(tabs[next].dataset.audience);tabs[next].focus();
  };
 }
 dialog.querySelector('.permission-close').onclick=()=>dialog.close();
 dialog.querySelector('.permission-discard').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{++requestId;});
 dialog.querySelector('.permission-page-name').textContent=document.querySelector('main h1')?.textContent||document.title;
 button.onclick=async()=>{
  const run=++requestId;busy=true;controls();dialog.showModal();status.textContent='Loading permissions…';
  try{const data=await request();if(run!==requestId)return;render(data);status.textContent='';busy=false;controls();}
  catch(error){if(run===requestId)status.textContent=error.message;}
 };
 form.onsubmit=async event=>{
  event.preventDefault();
  if(busy)return;
  const selected=name=>[...containers[name].querySelectorAll('input:checked')].map(input=>input.value);
  const accounts=selected('accounts').map(value=>{const [station,account]=JSON.parse(value);return {station,account};});
  const payload={revision,restricted:restricted.checked,roles:selected('roles'),accounts,members:selected('members')};
  const run=++requestId;busy=true;controls();status.textContent='Saving permissions…';
  try{const data=await request(payload);if(run!==requestId)return;render(data);status.textContent='Permissions saved.';}
  catch(error){if(run===requestId)status.textContent=error.message;}
  finally{if(run===requestId){busy=false;controls();}}
 };
 auth.onAuthStateChanged(async user=>{
  button.hidden=!['lake@mu.com','nextweek1216@gmail.com'].includes(String(user?.email||'').trim().toLowerCase());
  if(dialog.open)dialog.close();
 });
})();
