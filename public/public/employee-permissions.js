/* Shared role defaults and per-person overrides. Scope checks remain with each service. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./employee-positions'));else root.employeePermissions=factory(root.employeePositions);})(typeof globalThis==='object'?globalThis:this,function(positions){
 const station=positions.groups[0].positions,above=title=>station.slice(0,station.indexOf(title)+1);
 const catalog=[
  {key:'briefing.edit',label:'Briefing editing',description:'Assignments, reference information, contacts and reports',roles:above('Lead'),scope:'LAX / MU'},
  {key:'briefing.config',label:'Briefing configuration',description:'Cabin configuration settings',roles:above('Duty Manager'),scope:'LAX / MU'},
  {key:'schedule.edit',label:'Schedule editing',description:'Edit schedules and schedule settings',roles:above('Supervisor'),scope:'LAX / MU'},
  {key:'report.da',label:'Daily Flight Activity',description:'Edit DA reports',roles:above('Lead'),scope:'Main Account'},
  {key:'report.wwh',label:'Weekly Worked Hours',description:'Edit WWH reports',roles:['Supervisor','Business Manager'],scope:'Main Account'},
  {key:'report.dashboard',label:'Account reports & dashboard',description:'Dashboard, Expense and Terrific Ten reports',roles:above('Supervisor'),scope:'Main Account'},
  {key:'report.recharge',label:'Rechargeable hours',description:'Edit rechargeable hours reports',roles:above('Supervisor'),scope:'Main Account'},
  {key:'report.hrSafety',label:'Safety & HR reports',description:'Incident Investigation, COS, PAF and Record of Discussion',roles:above('Supervisor'),scope:'Main Account'},
  {key:'checklist.supervisor',label:'Checklist management',description:'Edit Emergency Procedure; view Incident and Workers Comp forms',roles:above('Supervisor'),scope:'Main Account'},
  {key:'readSign.publish',label:'Read & Sign publishing',description:'Publish and manage acknowledgments for permitted recipients',roles:positions.readSignPublishers,scope:'Authorized recipient accounts'},
  {key:'request.newAccess',label:'Request New Access',description:'Submit a new access request for Lake approval',roles:['Business Manager'],scope:'Main Account'}
 ];
 function defaultAllowed(row,key){const item=catalog.find(item=>item.key===key);return !!item&&item.roles.includes(positions.normalize(row?.position));}
 function allowed(row,key,fallback){const override=row?.permissionOverrides?.[key];return typeof override==='boolean'?override:(fallback===undefined?defaultAllowed(row,key):!!fallback);}
 return {catalog,allowed,defaultAllowed};
});
