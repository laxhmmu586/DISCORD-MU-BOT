/* Shared policy for the editor and API. Reporting lines are explicit, never inferred from titles. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./employee-positions'));else root.organizationModel=factory(root.employeePositions);})(typeof globalThis==='object'?globalThis:this,function(positions){
  const stationTitles=positions.groups[0].positions;
  const normalize=positions.normalize;
  const rank=title=>stationTitles.indexOf(normalize(title));
  const supervisorGroup=row=>'team:'+row.station+':'+row.account+':Supervisor';
  const isGroup=id=>typeof id==='string'&&id.startsWith('team:');
  function applyDefaultReporting(rows){return rows.map(row=>{
    if(row.reportsTo||row.unassigned||normalize(row.position)!=='Business Manager')return row;
    const eligible=rows.filter(manager=>manager.id!==row.id&&!manager.unassigned&&normalize(manager.position)==='General Manager'&&!descendants(row.id,rows).has(manager.id));
    const local=eligible.filter(manager=>manager.station===row.station),headquarters=eligible.filter(manager=>['HQ','HEADQUARTER','HEADQUARTERS'].includes(manager.station));
    const managers=local.length?local:headquarters;
    const sameAccount=managers.filter(manager=>manager.account===row.account||(manager.additionalAccounts||[]).some(scope=>scope.station===row.station&&scope.account===row.account));
    const matches=sameAccount.length?sameAccount:managers;
    return matches.length===1?{...row,reportsTo:matches[0].id}:row;
  });}
  function reportingManagers(row,rows){return isGroup(row.reportsTo)?rows.filter(manager=>!manager.unassigned&&normalize(manager.position)==='Supervisor'&&supervisorGroup(manager)===row.reportsTo):rows.filter(manager=>manager.id===row.reportsTo);}
  function descendants(id,rows){const found=new Set(),queue=[id];while(queue.length){const parent=queue.shift();for(const row of rows)if(reportingManagers(row,rows).some(manager=>manager.id===parent)&&!found.has(row.id)&&row.id!==id){found.add(row.id);queue.push(row.id);}}return found;}
  function canEdit(row,access,rows){
    if(!row||!access||row.id===access.employeeId&&!access.isServerOwner||access.mode!=='admin'&&row.isAdministrator)return false;
    if(access.mode==='admin')return true;
    const me=rows.find(r=>r.id===access.employeeId);
    return !!me&&descendants(me.id,rows).has(row.id)&&(access.editablePositions||[]).includes(normalize(row.position))&&row.station===access.station&&row.account===access.account;
  }
  function titlesFor(row,access,rows){
    if(!canEdit(row,access,rows))return [normalize(row.position)];
    const candidates=access.mode==='admin'?(row.station==='HQ'||row.account==='HQ'?positions.selectablePositions:stationTitles):access.editablePositions||[];
    const managers=reportingManagers(row,rows),children=rows.filter(r=>reportingManagers(r,rows).some(manager=>manager.id===row.id));
    return candidates.filter(title=>managers.every(manager=>rank(manager.position)<0||rank(title)<0||rank(manager.position)<rank(title))&&children.every(child=>rank(child.position)<0||rank(title)<0||rank(title)<rank(child.position)));
  }
  function validateLine(row,managerId,rows){
    if(!managerId)return '';
    if(isGroup(managerId)){
      if(managerId!==supervisorGroup(row)||!['Lead','Agent'].includes(normalize(row.position)))throw Error('Choose the Supervisor team in this employee’s account.');
      const managers=reportingManagers({...row,reportsTo:managerId},rows);if(!managers.length)throw Error('Add a Supervisor to this account first.');
      if(managers.some(manager=>manager.id===row.id||descendants(row.id,rows).has(manager.id)))throw Error('A reporting line cannot create a cycle.');
      return managerId;
    }
    if(managerId===row.id||descendants(row.id,rows).has(managerId))throw Error('A person cannot report to themselves or someone below them.');
    const manager=rows.find(r=>r.id===managerId);if(!manager)throw Error('Choose an existing manager.');
    if(normalize(row.position)==='Lead'&&normalize(manager.position)==='Supervisor'&&(row.station!==manager.station||row.account!==manager.account))throw Error('Choose a Supervisor from this employee’s Main Account.');
    if(normalize(row.position)==='Agent'&&normalize(manager.position)==='Supervisor')throw Error('Choose the Supervisor team so all Supervisors can manage this employee.');
    if(rank(manager.position)>=0&&rank(row.position)>=0&&rank(manager.position)>=rank(row.position))throw Error('The reporting manager must hold a higher title.');
    return managerId;
  }
  function managersFor(row,access,rows){const managers=rows.filter(manager=>{if(normalize(row.position)==='Agent'&&normalize(manager.position)==='Supervisor')return false;if(access.mode!=='admin'&&manager.id!==access.employeeId&&!canEdit(manager,access,rows))return false;try{validateLine(row,manager.id,rows);return true;}catch{return false;}});
    if(['Agent','Lead'].includes(normalize(row.position))){const id=supervisorGroup(row);try{validateLine(row,id,rows);const members=reportingManagers({...row,reportsTo:id},rows);if(access.mode==='admin'||members.some(manager=>manager.id===access.employeeId||canEdit(manager,access,rows)))managers.unshift({id,name:'All Supervisors · '+members.map(member=>member.name).join(', '),position:'Supervisor team',station:row.station,account:row.account});}catch{}}
    return managers;
  }
  function insertionPlan(targetId,position,name,access,rows){
    const targets=isGroup(targetId)?rows.filter(row=>normalize(row.position)==='Supervisor'&&supervisorGroup(row)===targetId):rows.filter(row=>row.id===targetId);
    if(!targets.length||targets.some(row=>!canEdit(row,access,rows)))throw Error('Choose people below you in your reporting line.');
    const first=targets[0];if(targets.some(row=>row.reportsTo!==first.reportsTo))throw Error('This team has different managers. Align its reporting line before inserting a level.');
    if(first.station!=='HQ'&&first.account!=='HQ'&&rank(position)<0)throw Error('Choose a station operations title for this account.');
    if(!first.reportsTo)throw Error('Assign a reporting manager before inserting a level.');
    const managers=reportingManagers(first,rows);if(!managers.length)throw Error('The reporting manager is outside this view.');
    if(!positions.valid(position)||(access.mode!=='admin'&&!(access.editablePositions||[]).includes(normalize(position))))throw Error('Choose a permitted title below your own.');
    if(managers.some(manager=>rank(manager.position)>=0&&rank(position)>=0&&rank(manager.position)>=rank(position))||targets.some(target=>rank(target.position)>=0&&rank(position)>=0&&rank(position)>=rank(target.position)))throw Error('Choose a title between the reporting manager and this team.');
    if(!String(name||'').trim())throw Error('Enter the new employee’s name.');
    return {targets:targets.map(row=>row.id),employee:{name:String(name).trim(),position,station:first.station,account:first.account,reportsTo:first.reportsTo,nickname:'',companyEmail:''}};
  }
  function assignable(row,access,rows){return canEdit(row,access,rows)||!!row?.unassigned&&row.id!==access?.employeeId&&(access?.mode==='admin'||!row.isAdministrator&&(access?.editablePositions||[]).includes(normalize(row.position))&&row.station===access.station&&row.account===access.account);}
  function assignmentPlan(targetId,sourceId,access,rows){
    const target=rows.find(row=>row.id===targetId),source=rows.find(row=>row.id===sourceId);
    if(!canEdit(target,access,rows)||!assignable(source,access,rows)||sourceId===targetId)throw Error('Choose an employee you can manage for this position.');
    if(!target.reportsTo)throw Error('Assign a reporting manager to this position first.');
    if(access.mode!=='admin'&&!(access.editablePositions||[]).includes(normalize(target.position)))throw Error('This title is above your management responsibility.');
    if(descendants(source.id,rows).size)throw Error('Reassign this employee’s direct reports before moving them to another position.');
    const moved={...source,position:target.position,station:target.station,account:target.account,reportsTo:target.reportsTo,unassigned:false,isInserted:!!target.isInserted,createdForOrganization:false};
    if(source.station!==target.station||source.account!==target.account)moved.additionalAccounts=(source.additionalAccounts||[]).filter(scope=>scope.station!==target.station||scope.account!==target.account);
    let next=rows.filter(row=>!(row.id===target.id&&target.createdForOrganization)).map(row=>row.id===source.id?moved:row.id===target.id?{...row,reportsTo:'',unassigned:true,isInserted:false}:row.reportsTo===target.id?{...row,reportsTo:source.id}:row);
    // An employee promoted from this team must not become their own report.
    next=next.map(row=>row.id!==source.id&&row.reportsTo===target.id?{...row,reportsTo:source.id}:row);
    validateLine(moved,moved.reportsTo,next);for(const row of next)if(row.reportsTo)validateLine(row,row.reportsTo,next);
    return {employees:next,selectedId:source.id};
  }
  function removalPlan(id,access,rows){
    const target=rows.find(row=>row.id===id);if(!target?.isInserted||!canEdit(target,access,rows))throw Error('Only an added level within your responsibility can be removed.');
    if(!target.reportsTo)throw Error('Assign a reporting manager before removing this level.');
    const next=rows.filter(row=>!(row.id===id&&target.createdForOrganization)).map(row=>row.id===id?{...row,reportsTo:'',unassigned:true,isInserted:false}:row.reportsTo===id?{...row,reportsTo:target.reportsTo}:row);
    for(const row of next)if(row.reportsTo)validateLine(row,row.reportsTo,next);
    return {employees:next};
  }
  return {applyDefaultReporting,descendants,canEdit,titlesFor,validateLine,managersFor,rank,supervisorGroup,isGroup,reportingManagers,insertionPlan,assignmentPlan,removalPlan,assignable};
});
