(() => {
 const query=new URLSearchParams(location.search);
 const standalone=!query.has('quick')&&!query.has('embed');
 const tools=[
  ['charge-form','charge-form','print-spacing','charge-form-model.js?v=20261101-charge-daily',d=>standalone&&d.direction==='departure'],
  ['express','arrival-express','20261102-on-demand',null,d=>standalone&&d.direction==='arrival'],
  ['checklists','departure-checklists','checklist-header-fields','departure-checklist-model.js?v=checklist-header-fields',d=>standalone&&d.direction==='departure'&&d.canUseChecklists]
 ];
 const assets=new Map();
 function loadAsset(tag,path){
  if(!assets.has(path)){
   const node=document.createElement(tag);
   if(tag==='link'){node.rel='stylesheet';node.href='/has/'+path;}
   else node.src='/has/'+path;
   const pending=new Promise((resolve,reject)=>{
    node.onload=resolve;
    node.onerror=()=>{node.remove();assets.delete(path);reject(new Error('Could not load '+path));};
   });
   assets.set(path,pending);
   document.head.append(node);
  }
  return assets.get(path);
 }
 for(const [id,name,version,model,available] of tools){
  const button=document.getElementById('briefing-'+id);
  if(!button)continue;
  let loading=false;
  const label=button.textContent;
  button.onclick=async()=>{
   if(loading)return;
   const context=window.briefingToolContext;
   if(!context?.ready)return;
   loading=true;
   button.textContent='Loading…';
   button.setAttribute('aria-busy','true');
   try{
    await Promise.all([
     loadAsset('link',name+'.css?v='+version),
     model&&loadAsset('script',model)
    ]);
    await loadAsset('script',name+'.js?v='+version);
    const latest=window.briefingToolContext;
    const host=button.closest('.flight-forms')?.querySelector('[data-charge-form-host]');
    if(host&&(host.hidden||!host.closest('dialog').open))return;
    if(latest?.ready&&!button.hidden&&!button.disabled&&context.date===latest.date&&context.flight===latest.flight&&context.direction===latest.direction)button.click();
   }catch{
    button.textContent=label+' (Retry)';
   }finally{
    loading=false;
    if(button.textContent==='Loading…')button.textContent=label;
    button.removeAttribute('aria-busy');
   }
  };
  window.addEventListener('briefing-direction',({detail})=>{
   window.briefingToolContext=detail;
   button.hidden=!detail.ready||!available(detail);
   if(id==='express')button.disabled=button.hidden;
  });
 }
})();
