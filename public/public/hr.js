(() => {
  const $=selector=>document.querySelector(selector), model=window.organizationModel;
  const preview=['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('preview')==='1';
  const storageKey='has-hr-design-v1';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data={employees:[],accounts:[],access:null},user=null,scope='LAX|MU',selected=null,zoom=1,view='chart',saving=false,loaded=false;
  const collapsed=new Set();
  let assignmentId=null;
  const titleCache=new Map();
  const key=row=>row.station+'|'+row.account;
  const initials=name=>name.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
  const label=value=>value==='all'?'All workspaces':value==='HQ|HQ'?'Headquarters':value==='station:LAX'?'LAX · All accounts':value.replace('|',' / ');
  function role(){
    if(!preview)return data.access;
    const value=$('#demo-role').value;
    return value==='admin'?{mode:'admin',employeeId:'account-MU',canManagePending:true}:{mode:'business-manager',employeeId:value==='bm'?'account-MU':'MU-sup-1',station:'LAX',account:'MU',editablePositions:value==='bm'?['Duty Manager','Senior Supervisor','Supervisor','Lead','Agent']:['Lead','Agent']};
  }
  function scopedRows(){return data.employees.filter(row=>scope==='all'||(scope==='station:LAX'?row.station==='LAX':key(row)===scope));}
  function contextRows(){
    const rows=scopedRows(),ids=new Set(rows.map(row=>row.id));
    // Keep the chain above the chosen team visible, when that chain is available to this user.
    for(const row of rows)for(const manager of model.reportingManagers(row,data.employees))ids.add(manager.id);
    return data.employees.filter(row=>ids.has(row.id));
  }
  function avatar(row){return `<span class="org-avatar tone-${row.id.length%4}" aria-hidden="true">${escape(initials(row.name))}</span>`;}
  function card(row){const current=role(),match=$('#org-search').value.trim().toLowerCase(),matches=(!match||(row.name+' '+row.position).toLowerCase().includes(match));return `<button type="button" class="org-card${row.id===current?.employeeId?' is-you':''}${selected===row.id?' is-selected':''}${model.rank(row.position)>=0&&model.rank(row.position)<6||row.position==='President'?' is-senior':''}${match?(matches?' is-match':' is-dim'):''}" data-person="${escape(row.id)}" aria-label="${escape(row.name+', '+row.position+(row.id===current?.employeeId?', You':''))}">${avatar(row)}${row.id===current?.employeeId?'<span class="org-you"><span aria-hidden="true">●</span> YOU</span>':''}<strong>${escape(row.name||'Unnamed employee')}</strong><span class="org-title">${escape(employeePositions.normalize(row.position))}</span><span class="org-location">${escape(row.station==='HQ'?'HEADQUARTERS':row.station+' / '+(row.account==='REGION'?'STATION OPERATIONS':row.account))}</span></button>`;}
  function renderNode(row,rows,path=new Set()){
    if(path.has(row.id))return '';const next=new Set([...path,row.id]),children=rows.filter(r=>r.reportsTo===row.id&&!next.has(r.id));
    const anchor=row.members?`<div class="org-team-group org-anchor"><span class="org-team-label">SUPERVISOR TEAM</span><div class="org-team-members">${row.members.map(member=>card(member)).join('')}</div><span class="org-team-note">Agents report to all Supervisors in this account</span></div>`:card(row).replace('class="org-card','class="org-anchor org-card');
    const insert=row.reportsTo&&rows.some(parent=>parent.id===row.reportsTo)&&!row.unassigned&&insertionTitles(row.id).length?`<button type="button" class="org-insert-on-line" data-insert-target="${escape(row.id)}" aria-label="Insert a level above ${escape(row.name)}" title="Insert a level above ${escape(row.name)}">＋</button>`:'';
    return `<li>${insert}${anchor}${children.length?`<button type="button" class="org-expand" data-expand="${escape(row.id)}" aria-expanded="${!collapsed.has(row.id)}">${children.length} ${row.members?'team members':'direct report'+(children.length===1?'':'s')} <span aria-hidden="true">${collapsed.has(row.id)?'+':'−'}</span></button>${collapsed.has(row.id)?'':`<ul class="org-list${children.length>5&&children.every(child=>['Agent','Lead'].includes(child.position))?' org-member-grid':''}">${children.map(child=>renderNode(child,rows,next)).join('')}</ul>`}`:''}</li>`;
  }
  function groupedRows(rows){
    const groups=new Map();for(const row of rows.filter(r=>r.position==='Supervisor'&&!r.unassigned&&r.reportsTo)){const id=model.supervisorGroup(row);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
    const supervisorIds=new Map([...groups].flatMap(([id,members])=>members.map(member=>[member.id,id])));
    return [...rows.filter(row=>!supervisorIds.has(row.id)).map(row=>({...row,reportsTo:supervisorIds.get(row.reportsTo)||row.reportsTo})),...[...groups].map(([id,members])=>({id,members,name:'Supervisor team',position:'Supervisor',station:members[0].station,account:members[0].account,reportsTo:members[0].reportsTo}))];
  }
  function drawConnections(){for(const surface of [$('#org-tree'),...$('#org-unassigned').querySelectorAll('.org-unassigned-tree')])drawSurfaceConnections(surface);}
  function drawSurfaceConnections(tree){
    tree.querySelector('.org-connectors')?.remove();
    if(!tree.getClientRects().length)return;
    const viewportWidth=tree===$('#org-tree')?$('#org-canvas').clientWidth:tree.parentElement.clientWidth;
    const available=Math.max(1,(viewportWidth-52)/zoom);
    for(const grid of tree.querySelectorAll('.org-member-grid')){const card=grid.querySelector('.org-card'),cardWidth=card?card.getBoundingClientRect().width/zoom:182,columns=Math.max(1,Math.min(5,Math.floor((available+20)/(cardWidth+20))));grid.style.setProperty('--org-member-columns',String(columns));}
    const bounds=tree.getBoundingClientRect(),scale=zoom,width=bounds.width/scale,height=bounds.height/scale;
    const point=(element,bottom)=>{const rect=element.getBoundingClientRect();return {x:(rect.left+rect.width/2-bounds.left)/scale,y:((bottom?rect.bottom:rect.top)-bounds.top)/scale};};
    const paths=[];
    for(const li of tree.querySelectorAll('li')){
      const parent=li.querySelector(':scope > .org-anchor'),children=[...li.querySelectorAll(':scope > .org-list > li > .org-anchor')];if(!parent||!children.length)continue;
      const from=point(parent,true),targets=children.map(child=>point(child,false));
      const grid=li.querySelector(':scope > .org-member-grid');
      const rows=[];targets.forEach((target,index)=>{let row=rows.find(row=>Math.abs(row.y-target.y)<2);if(!row){row={y:target.y,indices:[]};rows.push(row);}row.indices.push(index);});rows.sort((a,b)=>a.y-b.y);
      const firstBusY=rows[0].y-28;paths.push(`M ${from.x} ${from.y} V ${firstBusY}`);
      let railX=null;
      if(grid&&rows.length>1){const left=Math.min(...children.map(child=>(child.getBoundingClientRect().left-bounds.left)/scale));railX=left-14;paths.push(`M ${railX} ${firstBusY} H ${from.x}`,`M ${railX} ${firstBusY} V ${rows.at(-1).y-28}`);}
      for(const row of rows){const busY=row.y-28,xs=row.indices.map(index=>targets[index].x),minX=railX===null?Math.min(from.x,...xs):railX,maxX=grid?Math.max(...xs):Math.max(from.x,...xs);if(minX!==maxX)paths.push(`M ${minX} ${busY} H ${maxX}`);
        for(const index of row.indices){const target=targets[index],child=children[index];paths.push(`M ${target.x} ${busY} V ${target.y}`);const button=child.parentElement.querySelector(':scope > .org-insert-on-line');if(!button)continue;const liBounds=child.parentElement.getBoundingClientRect();button.style.left=(target.x-(liBounds.left-bounds.left)/scale)+'px';button.style.top=(busY-(liBounds.top-bounds.top)/scale-button.offsetHeight/2)+'px';}
      }
    }
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('org-connectors');svg.setAttribute('aria-hidden','true');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths.join(' '));svg.append(path);tree.prepend(svg);
  }
  function render(){
    $('#hr-pending-link').hidden=!(role()?.mode==='admin'&&role()?.canManagePending===true);
    const rows=scopedRows(),contexts=groupedRows(contextRows());
    $('#people-count').textContent=rows.length;
    $('#team-count').textContent=rows.filter(r=>r.reportsTo).length;
    $('#chart-heading').textContent=label(scope);
    $('#chart-description').textContent=scope==='HQ|HQ'?'The people and departments behind our shared direction.':'Select a person to view their profile and reporting line.';
    const query=$('#org-search').value.trim().toLowerCase();
    let display=contexts;
    if(query){
      const ids=new Set();for(const row of contexts.filter(r=>(r.name+' '+r.position+' '+(r.members||[]).map(member=>member.name+' '+member.position).join(' ')).toLowerCase().includes(query))){ids.add(row.id);let parent=row.reportsTo,seen=new Set();while(parent&&!seen.has(parent)){seen.add(parent);const manager=contexts.find(r=>r.id===parent);if(!manager)break;ids.add(parent);collapsed.delete(parent);parent=manager.reportsTo;}}
      display=contexts.filter(r=>ids.has(r.id));
    }
    const ids=new Set(display.map(r=>r.id)),unassigned=display.filter(r=>r.unassigned||!r.reportsTo&&r.position!=='President'&&data.employees.some(other=>other.id!==r.id));
    const unassignedIds=new Set(unassigned.map(r=>r.id));
    const roots=display.filter(r=>(!r.reportsTo||!ids.has(r.reportsTo))&&!unassignedIds.has(r.id));
    $('#org-tree').innerHTML=roots.length?`<ul class="org-list">${roots.map(row=>renderNode(row,display)).join('')}</ul>`:'';
    $('#org-unassigned').innerHTML=unassigned.length?`<section class="hr-unassigned"><h3>Reporting line not assigned · ${unassigned.length}</h3><div><div class="org-unassigned-tree"><ul class="org-list">${unassigned.map(row=>renderNode(row,display)).join('')}</ul></div></div></section>`:'';
    $('#hr-status').textContent=!loaded?'Sign in to view your organization.':!data.employees.length?'No employees are available in this workspace.':!display.length?'No people match your search.':!roots.length&&unassigned.length?'Assign reporting managers in each profile to build your organization chart.':'';
    $('#org-canvas').hidden=!roots.length;
    $('#org-accounts').innerHTML=[...employeeAccountGroups.regions,'Other stations'].map(region=>{const accounts=(data.accounts||[]).filter(account=>(account.station==='HQ'?'West Coast':employeeAccountGroups.regionName(account.station))===region);if(!accounts.length)return '';return `<section class="hr-account-region"><h3>${escape(region)} <span>${accounts.length} workspaces</span></h3><div>${accounts.map(account=>{const count=data.employees.filter(r=>key(r)===key(account)).length;return `<button type="button" class="hr-account-card" data-scope="${escape(key(account))}"><small>${account.station==='HQ'?'HEADQUARTERS':'STATION / ACCOUNT'}</small><strong>${escape(label(key(account)))}</strong><span>${count} ${count===1?'person':'people'}</span><em>Explore team →</em></button>`;}).join('')}</div></section>`;}).join('');
    applyZoom();
  }
  function populateScopes(){
    const values=['all',...(preview?['HQ|HQ','station:LAX']:[]),...(data.accounts||[]).map(key)];
    const unique=[...new Set(values)];if(!unique.includes(scope))scope=unique[0]||'all';
    $('#org-scope').innerHTML=unique.map(value=>`<option value="${escape(value)}">${escape(label(value))}</option>`).join('');$('#org-scope').value=scope;
  }
  function chooseScope(value){scope=value;$('#org-scope').value=value;collapsed.clear();if(scope==='HQ|HQ'||scope==='all')data.employees.filter(r=>r.reportsTo==='president').forEach(r=>collapsed.add(r.id));if(scope==='station:LAX')data.employees.filter(r=>r.reportsTo==='regional').forEach(r=>collapsed.add(r.id));render();requestAnimationFrame(()=>{const canvas=$('#org-canvas');canvas.scrollLeft=Math.max(0,(canvas.scrollWidth-canvas.clientWidth)/2);});}
  function setView(value){view=value;for(const [name,panel] of [['chart','org-chart-panel'],['accounts','org-accounts-panel']]){const button=$('#'+name+'-tab');button.setAttribute('aria-selected',String(value===name));button.tabIndex=value===name?0:-1;$('#'+panel).hidden=value!==name;}$('#org-search').disabled=value!=='chart';}
  function applyZoom(){$('#org-tree').style.zoom=String(zoom);$('#org-unassigned').querySelectorAll('.org-unassigned-tree').forEach(surface=>surface.style.zoom=String(zoom));$('#zoom-reset').textContent=Math.round(zoom*100)+'%';requestAnimationFrame(drawConnections);}
  const chartResize=new ResizeObserver(()=>requestAnimationFrame(drawConnections));chartResize.observe($('#org-tree'));chartResize.observe($('#org-canvas'));chartResize.observe($('#org-unassigned'));
  async function api(options,suffix=''){const token=await user.getIdToken();const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/employee-admin-api/organization'+suffix,{cache:'no-store',...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});const result=await response.json();if(!response.ok)throw Error(result.error||'Organization unavailable.');return result;}
  function insertionTitles(id){const cacheKey=data.revision+'|'+role()?.employeeId+'|'+role()?.mode+'|'+id;if(titleCache.has(cacheKey))return titleCache.get(cacheKey);const values=employeePositions.selectablePositions.filter(position=>{try{model.insertionPlan(id,position,'New employee',role(),data.employees);return true;}catch{return false;}});titleCache.set(cacheKey,values);return values;}
  function updateInsertTitles(){const form=$('#insert-form'),titles=insertionTitles(form.elements.target.value);form.elements.position.innerHTML=titles.map(title=>`<option>${escape(title)}</option>`).join('');const target=groupedRows(data.employees).find(row=>row.id===form.elements.target.value),manager=target&&data.employees.find(row=>row.id===target.reportsTo);$('#insert-route').textContent=target?`${manager?.name||'Supervisor team'} → New level → ${target.name}`:'';$('#confirm-insert').disabled=!titles.length;}
  function openInsert(targetId){const target=groupedRows(data.employees).find(row=>row.id===targetId);if(!target)return;const form=$('#insert-form');form.reset();form.elements.target.innerHTML=`<option value="${escape(target.id)}">${escape(target.name+' · '+label(key(target)))}</option>`;$('#insert-status').textContent='';updateInsertTitles();$('#insert-dialog').showModal();}
  $('#insert-form').elements.target.onchange=updateInsertTitles;
  const closeInsert=()=>{if(!saving)$('#insert-dialog').close();};$('#close-insert').onclick=closeInsert;$('#cancel-insert').onclick=closeInsert;$('#insert-dialog').addEventListener('cancel',event=>{event.preventDefault();closeInsert();});
  $('#insert-form').onsubmit=async event=>{event.preventDefault();if(saving)return;const form=event.currentTarget,body={revision:data.revision,targetId:form.elements.target.value,position:form.elements.position.value,name:form.elements.name.value.trim()};saving=true;$('#confirm-insert').disabled=true;try{const plan=model.insertionPlan(body.targetId,body.position,body.name,role(),data.employees);if(preview){const id=crypto.randomUUID(),result={...data,revision:data.revision+1,employees:[...data.employees.map(row=>plan.targets.includes(row.id)?{...row,reportsTo:id}:row),{...plan.employee,id,isInserted:true,createdForOrganization:true}]};localStorage.setItem(storageKey,JSON.stringify(result));data=result;}else data=await api({method:'POST',body:JSON.stringify(body)},'/insert');$('#insert-dialog').close();collapsed.clear();render();}catch(error){$('#insert-status').textContent=error.message;}finally{saving=false;$('#confirm-insert').disabled=false;}};
  function showPerson(id){
    selected=id;const row=data.employees.find(r=>r.id===id);if(!row)return;
    const access=role(),editable=model.canEdit(row,access,data.employees),form=$('#person-form');
    assignmentId=null;$('#assignment-note').hidden=true;$('#employee-suggestions').hidden=true;form.elements.name.setAttribute('aria-expanded','false');$('#remove-level').hidden=!row.isInserted||!editable;
    $('#person-summary').innerHTML=`<div class="hr-person-heading">${avatar(row)}<h2 id="person-name">${escape(row.name)}</h2><p>${escape(employeePositions.normalize(row.position))}</p><small>${escape(label(key(row)))}</small></div>`;
    $('#person-permission').textContent=editable?'You can update this employee’s details and reporting line.':row.id===access?.employeeId?'Your title and reporting line are managed by your manager.':'View only · This person is outside your management responsibility.';
    for(const field of ['name','nickname','companyEmail']){form.elements[field].value=row[field]||'';form.elements[field].disabled=!editable;}
    for(const field of ['pbbId','pbbExpiry','pbbMscId','pbbMscExpiry']){form.elements[field].value=row[field]||'';form.elements[field].disabled=!editable;}
    personTab('profile');renderPermissions(row,editable);
    const titles=[...new Set([employeePositions.normalize(row.position),...model.titlesFor(row,access,data.employees)])];
    form.elements.position.innerHTML=titles.map(title=>`<option>${escape(title)}</option>`).join('');form.elements.position.value=employeePositions.normalize(row.position);form.elements.position.disabled=!editable;
    const managers=model.managersFor(row,access,data.employees),existing=managers.find(r=>r.id===row.reportsTo)||data.employees.find(r=>r.id===row.reportsTo);if(existing&&!managers.some(r=>r.id===existing.id))managers.unshift(existing);
    form.elements.reportsTo.innerHTML=`<option value="">${row.reportsTo&&!existing?'Manager outside this view':'Not assigned'}</option>`+managers.map(manager=>`<option value="${escape(manager.id)}">${escape(manager.name+' · '+manager.position)}</option>`).join('');
    // Keep an out-of-scope relationship intact when viewing a scoped roster.
    if(row.reportsTo&&!existing){const option=document.createElement('option');option.value=row.reportsTo;option.textContent='Manager outside this view';form.elements.reportsTo.append(option);}
    form.elements.reportsTo.value=row.reportsTo||'';form.elements.reportsTo.disabled=!editable;
    form.elements.scope.innerHTML=(data.accounts||[]).map(account=>`<option value="${escape(key(account))}">${escape(label(key(account)))}</option>`).join('');
    if(![...form.elements.scope.options].some(option=>option.value===key(row))){const option=document.createElement('option');option.value=key(row);option.textContent=label(key(row));form.elements.scope.append(option);}
    form.elements.scope.value=key(row);form.elements.scope.disabled=!editable||access.mode!=='admin';
    const direct=data.employees.filter(r=>model.reportingManagers(r,data.employees).some(manager=>manager.id===id));
    $('#person-reports').innerHTML=direct.length?`<h3>Direct reports · ${direct.length}</h3>`+direct.map(child=>`<button type="button" data-person="${escape(child.id)}">${escape(child.name)} <span>→</span></button>`).join(''):'';
    $('#person-status').textContent='';$('#save-person').hidden=!editable;$('#save-person').disabled=false;
    if(!$('#person-dialog').open)$('#person-dialog').showModal();render();
  }
  $('.hr-settings').onclick=event=>{event.preventDefault();setView('accounts');};
  const closePerson=()=>{if(saving)return;$('#person-dialog').close();selected=null;render();};
  $('#person-form').elements.name.addEventListener('input',event=>{if(assignmentId){const text=event.target.value;showPerson(selected);event.target.value=text;}assignmentId=null;$('#assignment-note').hidden=true;const query=event.target.value.trim().toLowerCase(),host=$('#employee-suggestions');const matches=query?data.employees.filter(row=>row.id!==selected&&!row.createdForOrganization&&model.assignable(row,role(),data.employees)&&(row.name+' '+(row.nickname||'')).toLowerCase().includes(query)).slice(0,8):[];host.innerHTML=matches.map(row=>`<button type="button" data-assign-person="${escape(row.id)}">${avatar(row)}<span><strong>${escape(row.name)}</strong><small>${escape(row.position+' · '+label(key(row)))}</small></span></button>`).join('');host.hidden=!matches.length;event.target.setAttribute('aria-expanded',String(!!matches.length));});
  $('#employee-suggestions').addEventListener('click',event=>{const button=event.target.closest('[data-assign-person]');if(!button)return;assignmentId=button.dataset.assignPerson;const source=data.employees.find(row=>row.id===assignmentId),target=data.employees.find(row=>row.id===selected);const form=$('#person-form');form.elements.name.value=source.name;for(const field of ['nickname','companyEmail','pbbId','pbbExpiry','pbbMscId','pbbMscExpiry']){form.elements[field].value=source[field]||'';form.elements[field].disabled=true;}for(const field of ['position','reportsTo','scope'])form.elements[field].disabled=true;$('#employee-suggestions').hidden=true;$('#person-form').elements.name.setAttribute('aria-expanded','false');$('#assignment-note').hidden=false;$('#assignment-note').textContent=`Assign ${source.name} to ${target.position} · ${label(key(target))}. Their existing profile and PBB details will be retained.${target.createdForOrganization?'':` ${target.name} will move to Unassigned.`}`;});
  $('#remove-level').onclick=()=>{const row=data.employees.find(r=>r.id===selected),manager=data.employees.find(r=>r.id===row.reportsTo);$('#remove-explanation').textContent=`Remove ${row.name} from this added level. Direct reports will reconnect to ${manager?.name||'the Supervisor team'}.${row.createdForOrganization?' This added placeholder will be removed.':' The employee’s real profile will remain in Unassigned.'}`;$('#remove-status').textContent='';$('#remove-dialog').showModal();};
  const closeRemove=()=>{if(!saving)$('#remove-dialog').close();};$('#close-remove').onclick=closeRemove;$('#cancel-remove').onclick=closeRemove;$('#remove-dialog').addEventListener('cancel',event=>{event.preventDefault();closeRemove();});
  $('#confirm-remove').onclick=async()=>{if(saving)return;saving=true;$('#confirm-remove').disabled=true;try{if(preview){const plan=model.removalPlan(selected,role(),data.employees),result={...data,employees:plan.employees,revision:data.revision+1};localStorage.setItem(storageKey,JSON.stringify(result));data=result;}else data=await api({method:'POST',body:JSON.stringify({id:selected,revision:data.revision})},'/remove');$('#remove-dialog').close();$('#person-dialog').close();selected=null;render();}catch(error){$('#remove-status').textContent=error.message;}finally{saving=false;$('#confirm-remove').disabled=false;}};
  function personTab(value){for(const name of ['profile','pbb','permission']){const active=value===name,tab=$('#person-'+name+'-tab');tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$('#person-'+name+'-panel').hidden=!active;}$('#save-person').hidden=value==='permission'||!model.canEdit(data.employees.find(row=>row.id===selected),role(),data.employees);}
  for(const name of ['profile','pbb','permission']){$('#person-'+name+'-tab').onclick=()=>personTab(name);$('#person-'+name+'-tab').onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const names=['profile','pbb','permission'],index=names.indexOf(name),next=event.key==='Home'?'profile':event.key==='End'?'permission':names[(index+(event.key==='ArrowRight'?1:2))%3];personTab(next);$('#person-'+next+'-tab').focus();}};}
  function renderPermissions(row,editable){
    const policy=employeePermissions,actor=data.employees.find(person=>person.id===role()?.employeeId);
    $('#permission-status').textContent='';$('#save-permissions').hidden=!editable;
    $('#permission-list').innerHTML=policy.catalog.map(item=>{const value=row.permissionOverrides?.[item.key],effective=policy.allowed(row,item.key),canChange=editable&&(role().mode==='admin'||policy.allowed(actor,item.key));return `<label class="hr-permission-row"><span><strong>${escape(item.label)}</strong><small>${escape(item.description)}</small><small>${escape(item.scope)} · Role default: ${policy.defaultAllowed(row,item.key)?'Allowed':'Not allowed'}</small></span><span><b class="${effective?'is-allowed':''}">${effective?'Allowed':'Not allowed'}</b><select data-permission-key="${item.key}" ${canChange?'':'disabled'} aria-label="${escape(item.label)} permission"><option value="default" ${value===undefined?'selected':''}>Role default</option><option value="allow" ${value===true?'selected':''}>Allow</option><option value="deny" ${value===false?'selected':''}>Deny</option></select></span></label>`;}).join('');
  }
  $('#save-permissions').onclick=async()=>{if(saving)return;const row=data.employees.find(person=>person.id===selected),permissions={...row.permissionOverrides};for(const select of $('#permission-list').querySelectorAll('select')){if(select.disabled)continue;const key=select.dataset.permissionKey;if(select.value==='default')delete permissions[key];else permissions[key]=select.value==='allow';}saving=true;$('#save-permissions').disabled=true;try{if(preview){const actor=data.employees.find(person=>person.id===role().employeeId);if(!model.canEdit(row,role(),data.employees))throw Error('Only lower-level employees can be managed.');if(role().mode!=='admin')for(const key of Object.keys(permissions))if(!employeePermissions.allowed(actor,key)&&employeePermissions.allowed({...row,permissionOverrides:permissions},key)!==employeePermissions.allowed(row,key))throw Error('You cannot change permissions you do not hold.');const result={...data,revision:data.revision+1,employees:data.employees.map(person=>person.id===row.id?{...person,permissionOverrides:permissions}:person)};localStorage.setItem(storageKey,JSON.stringify(result));data=result;}else data=await api({method:'POST',body:JSON.stringify({id:row.id,revision:data.revision,permissions})},'/permissions');renderPermissions(data.employees.find(person=>person.id===row.id),true);$('#permission-status').textContent=preview?'Permissions saved in this browser.':'Permissions saved.';}catch(error){$('#permission-status').textContent=error.message;}finally{saving=false;$('#save-permissions').disabled=false;}};
  $('#person-form').addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;const row=data.employees.find(r=>r.id===selected),access=role(),form=event.currentTarget;
    if(!model.canEdit(row,access,data.employees))return;
    const changes=Object.fromEntries(['name','nickname','position','companyEmail','reportsTo'].map(field=>[field,form.elements[field].value.trim()]));
    for(const field of ['pbbId','pbbExpiry','pbbMscId','pbbMscExpiry'])changes[field]=form.elements[field].value.trim();
    if(access.mode==='admin'){const [station,account]=form.elements.scope.value.split('|');changes.station=station;changes.account=account;}
    saving=true;$('#save-person').disabled=true;$('#person-status').textContent='Saving changes…';
    try{
      if(assignmentId){const sourceId=assignmentId;if(preview){const plan=model.assignmentPlan(row.id,sourceId,access,data.employees),result={...data,employees:plan.employees,revision:data.revision+1};localStorage.setItem(storageKey,JSON.stringify(result));data=result;}else data=await api({method:'POST',body:JSON.stringify({id:row.id,employeeId:sourceId,revision:data.revision})},'/assign');showPerson(sourceId);$('#person-status').textContent='Employee assigned. Their existing profile and PBB details have been retained.';return;}
      const next={...row,...changes};model.validateLine(next,next.reportsTo,data.employees);
      for(const [idField,dateField] of [['pbbId','pbbExpiry'],['pbbMscId','pbbMscExpiry']])if(Boolean(next[idField])!==Boolean(next[dateField]))throw Error('Enter each PBB ID together with its valid-through date.');
      if(!model.titlesFor(row,access,data.employees).includes(next.position))throw Error('Choose a permitted title.');
      if(access.mode!=='admin'&&(!next.reportsTo||!model.managersFor(next,access,data.employees).some(r=>r.id===next.reportsTo)))throw Error('Choose a manager within your reporting team.');
      if((next.station!==row.station||next.account!==row.account)&&model.descendants(row.id,data.employees).size)throw Error('Reassign direct reports before changing this person’s account.');
      const nextRows=data.employees.map(r=>r.id===row.id?next:r);for(const child of data.employees.filter(r=>model.reportingManagers(r,data.employees).some(manager=>manager.id===row.id)))model.validateLine(child,child.reportsTo,nextRows);
      if(preview){const result={...data,employees:nextRows,revision:data.revision+1};localStorage.setItem(storageKey,JSON.stringify(result));data=result;}else data=await api({method:'POST',body:JSON.stringify({id:row.id,revision:data.revision,changes})});
      $('#person-dialog').close();selected=null;render();const toast=$('#hr-toast');toast.textContent=preview?'Preview updated · Saved in this browser':'Employee profile updated';toast.hidden=false;setTimeout(()=>toast.hidden=true,4000);
    }catch(error){$('#person-status').textContent=error.message;}finally{saving=false;$('#save-person').disabled=false;}
  });
  document.addEventListener('click',event=>{const insert=event.target.closest('[data-insert-target]');if(insert){openInsert(insert.dataset.insertTarget);return;}const person=event.target.closest('[data-person]');if(person){showPerson(person.dataset.person);return;}const expand=event.target.closest('[data-expand]');if(expand){const id=expand.dataset.expand;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);render();}const account=event.target.closest('[data-scope]');if(account){setView('chart');chooseScope(account.dataset.scope);}});
  $('#org-scope').onchange=event=>chooseScope(event.target.value);$('#org-search').oninput=render;
  for(const value of ['chart','accounts']){$('#'+value+'-tab').onclick=()=>setView(value);$('#'+value+'-tab').onkeydown=event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'chart':event.key==='End'?'accounts':value==='chart'?'accounts':'chart';setView(next);$('#'+next+'-tab').focus();}};}
  $('#close-person').onclick=closePerson;$('#cancel-person').onclick=closePerson;$('#person-dialog').addEventListener('cancel',event=>{event.preventDefault();closePerson();});
  $('#person-dialog').addEventListener('click',event=>{if(event.target===$('#person-dialog')){const bounds=event.target.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closePerson();}});
  $('#zoom-out').onclick=()=>{zoom=Math.max(.5,zoom-.1);applyZoom();};$('#zoom-in').onclick=()=>{zoom=Math.min(1.5,zoom+.1);applyZoom();};$('#zoom-reset').onclick=()=>{zoom=1;applyZoom();};
  $('#demo-role').onchange=()=>{closePerson();if($('#demo-role').value!=='admin')chooseScope('LAX|MU');else render();};
  $('#reset-preview').onclick=()=>{localStorage.removeItem(storageKey);data=hrReferenceData();const own=data.employees.find(row=>row.id==='account-MU');if(own)own.name='Lake';titleCache.clear();populateScopes();chooseScope(scope);};
  const mobile=matchMedia('(max-width:760px)'),sidebar=$('#hr-sidebar'),menu=$('.menu-toggle');
  function drawer(open){document.body.classList.toggle('sidebar-open',open);menu.setAttribute('aria-expanded',String(open));$('.sidebar-scrim').hidden=!open;sidebar.inert=mobile.matches&&!open;if(open)sidebar.querySelector('a').focus();}
  menu.onclick=()=>drawer(!document.body.classList.contains('sidebar-open'));$('.sidebar-scrim').onclick=()=>{drawer(false);menu.focus();};mobile.addEventListener('change',()=>drawer(false));drawer(false);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){drawer(false);document.querySelectorAll('.department-nav').forEach(details=>details.open=false);}if(event.key==='Tab'&&mobile.matches&&document.body.classList.contains('sidebar-open')){const links=[...sidebar.querySelectorAll('a[href]')],first=links[0],last=links.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  document.addEventListener('click',event=>document.querySelectorAll('.department-nav').forEach(details=>{if(!details.contains(event.target))details.open=false;}));
  $('#hr-date').textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',weekday:'short',month:'short',day:'numeric'}).format(new Date());
  if(preview){
    data=hrReferenceData();try{const saved=JSON.parse(localStorage.getItem(storageKey));if(Array.isArray(saved?.employees)&&Array.isArray(saved?.accounts))data=saved;}catch{}
    const referenceIds=new Set(hrReferenceData().employees.map(row=>row.id));for(const row of data.employees){if(!referenceIds.has(row.id)&&row.isInserted===undefined){row.isInserted=true;row.createdForOrganization=true;}const manager=data.employees.find(r=>r.id===row.reportsTo);if(row.position==='Agent'&&manager?.position==='Supervisor'&&row.station===manager.station&&row.account===manager.account)row.reportsTo=model.supervisorGroup(row);}
    const own=data.employees.find(row=>row.id==='account-MU');if(own?.name==='MU Business Manager')own.name='Lake';$('#flight-account').innerHTML='<div class="hr-preview-account"><span class="hr-preview-scope">LAX / MU</span><a href="/profile?preview=1" class="hr-user" aria-label="Lake profile"><span class="hr-user-avatar">L</span><span>Lake</span></a></div>';
    loaded=true;$('#hr-preview-note').hidden=false;$('#demo-role-label').hidden=false;populateScopes();chooseScope(scope);
    // Keep the complete local design journey in preview mode, including Home → HR.
    document.querySelectorAll('a[href="/home"],a[href="/hr"]').forEach(link=>link.href+='?preview=1');
  }else if(window.firebase?.apps?.length){
    firebase.auth().onAuthStateChanged(async current=>{user=current;data={employees:[],accounts:[],access:null};loaded=false;render();if(!user){$('#hr-status').innerHTML='Sign in to view HR. <a href="/login.html">Sign in →</a>';return;}try{data=await api();loaded=true;populateScopes();chooseScope(scope);}catch(error){$('#hr-status').textContent=error.message;}});
  }else{$('#hr-status').innerHTML='Sign in to view HR. <a href="/login.html">Sign in →</a>';}
})();
