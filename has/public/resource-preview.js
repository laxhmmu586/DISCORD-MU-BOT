/* Browser-only resource design fixtures. Never replaces authenticated production behavior. */
(() => {
 if(!['127.0.0.1','localhost','[::1]'].includes(location.hostname)||new URLSearchParams(location.search).get('preview')!=='1')return;
 window.resourceDesignPreview=true;
 const banner=document.createElement('p');banner.className='resource-preview-banner';banner.textContent='DESIGN PREVIEW · Sample workspace · No changes to employee records.';document.querySelector('main').prepend(banner);
 document.querySelectorAll('a[href="/has-checklist"]').forEach(link=>link.href+='?preview=1');
 if(!document.getElementById('checklist-content'))return;
 const items=[['bomb-threat','Bomb Threat Checklist','pdf'],['emergency-notification','Emergency Procedure Notification','pdf'],['incident-occurrence','Incident / Occurrence Report Package','pdf'],['concentra','Concentra Authorization Form','pdf'],['lax-reliant','LAX Reliant Authorization for Treatment','pdf'],['ca-mpn','CA MPN Acknowledgement Form','pdf']].map(([id,title,format])=>({id,title,format,version:'Employee resource · '+format.toUpperCase(),canEdit:id==='emergency-notification'}));
 window.hasReportRequest=async(path,body)=>{
   if(path==='/context')return {scope:{station:'LAX',account:'MU'},permissions:{da:true,wwh:true,rechargeable:true},canAdmin:true,canChecklist:true};
   if(path==='/checklist')return {scope:{station:'LAX',account:'MU'},categories:[{name:'Safety',items:items.slice(0,3)},{name:'Workers Comp',items:items.slice(3)}]};
   if(path==='/checklist/emergency-notification/content'){const saved=JSON.parse(localStorage.getItem('has-emergency-design')||'null');if(body){localStorage.setItem('has-emergency-design',JSON.stringify(body.values));return {revision:Date.now()};}return {revision:1,canEdit:true,fields:window.emergencyNotification.fields,calls:window.emergencyNotification.calls,contacts:window.emergencyNotification.normalize(saved||{}),directory:[{name:'Nouri, Nihad',position:'General Manager'}],values:saved||{}};}
   const response=await fetch('/__preview'+path,path==='/checklist/emergency-notification/export'?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:JSON.parse(localStorage.getItem('has-emergency-design')||'{}')})}:{});if(!response.ok)throw Error('This preview resource is unavailable.');return response.blob();
 };
 window.hasReportContext={canChecklist:true,scope:{station:'LAX',account:'MU'}};
})();
