(function(root){
 'use strict';
 root.CbsBagTagEdit={install({save,refresh}){
  let active=null;
  const target=event=>event.target.closest?.('[data-edit-bag-tag]');
  document.addEventListener('click',event=>{if(target(event))event.stopPropagation();},true);
  function begin(node){
   if(active||node.querySelector('input'))return;
   const previous=node.textContent.trim(),form=document.createElement('form'),input=document.createElement('input'),status=document.createElement('small');
   input.value=previous;input.maxLength=8;input.required=true;input.pattern='[A-Za-z0-9]{2}[0-9]{6}';input.setAttribute('aria-label','Bag tag number');input.autocomplete='off';
   status.setAttribute('role','status');form.className='bag-tag-edit-form';form.append(input,status);node.replaceChildren(form);active=node;root.cbsBagTagEditing=true;
   let saving=false,finished=false;
   const finish=value=>{finished=true;node.textContent=value;active=null;root.cbsBagTagEditing=false;};
   const commit=async()=>{
    if(saving||finished)return;input.value=input.value.trim().toUpperCase().replace(/[\s-]+/g,'');
    if(input.value===previous){finish(previous);return;}
    if(!input.checkValidity()){status.textContent='Use MU123456 format.';input.setAttribute('aria-invalid','true');return;}
    saving=true;input.disabled=true;status.textContent='Saving…';
    try{await save({source:node.dataset.tagSource,field:node.dataset.tagField||'bagTag',rowNumber:node.dataset.tagRow,oldTag:previous,bagTag:input.value});finish(input.value);await refresh();}
    catch(error){if(!finished){status.textContent=error.message||'Save failed. Try again.';input.disabled=false;input.setAttribute('aria-invalid','true');saving=false;input.focus();}}
   };
   form.addEventListener('submit',event=>{event.preventDefault();void commit();});input.addEventListener('blur',()=>void commit());
   input.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'&&!saving){event.preventDefault();finish(previous);}});
   input.focus();input.select();
  }
  document.addEventListener('dblclick',event=>{const node=target(event);if(node){event.preventDefault();event.stopPropagation();begin(node);}},true);
  document.addEventListener('keydown',event=>{const node=target(event);if(node&&event.target===node&&event.key==='Enter'){event.preventDefault();event.stopPropagation();begin(node);}},true);
 }};
})(window);
