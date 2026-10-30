(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.requestDownloadName=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 const titles={uniform:'Uniform Replacement Request',incident:'Incident Investigation Report',expense:'Expense Report',terrific:'Terrific Ten Distribution Form',arrival:'HAS PBB Arrival',departure:'HAS PBB Departure'};
 const clean=value=>String(value||'Unknown').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'').slice(0,100)||'Unknown';
 function filename(kind,r,ext='pdf'){
  const first=(r.timeline||[]).find(e=>e.action==='submit'),at=first?.at||r.submittedAt||r.createdAt||r.date;
  const date=at&& !Number.isNaN(Date.parse(at))?(/^\d{4}-\d{2}-\d{2}$/.test(at)?at:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at))):'Unknown date';
  const employee=r.employee||{},account=[employee.station||r.station,employee.account||r.account].filter(Boolean).join('-');
  return [titles[kind]||kind,account,first?.name||employee.name||r.submitterName||r.signatures?.driver?.name,date].map(clean).join('_')+'.'+ext;
 }
 filename.disposition=(kind,r,ext='pdf')=>{const name=filename(kind,r,ext);return 'attachment; filename="'+name.replace(/[^\x20-\x7e]/g,'_')+'"; filename*=UTF-8\'\''+encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());};
 return filename;
});
