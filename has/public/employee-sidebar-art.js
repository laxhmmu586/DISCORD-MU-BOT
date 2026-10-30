(() => {
 const choices=["wave-glasses-woman","welcome-grace-woman","tablet-kelven-man","thumbs-up-glasses-man","welcome-glasses-man","wave-glenn-man","arms-victoria-woman","arms-purple-scarf-woman","arms-white-tie-man","welcome-blue-scarf-woman"];
 const key='has-pbb-sidebar-v2';
 for(const footer of document.querySelectorAll('.profile-sidebar .sidebar-airport,.has-sidebar .has-sidebar-bottom,[data-employee-art]')){
  if(!footer.hasAttribute('data-employee-art')&&!footer.parentElement.querySelector('.sidebar-pbb-checklist')){
   const link=document.createElement('a');link.className='sidebar-pbb-checklist';link.href='/has-pbb.html';link.textContent='PBB checklist';footer.before(link);
  }
  let image=footer.querySelector('#has-sidebar-employee');
  if(image?.dataset.employeeArtInitialized==='true')continue;
  if(!image){image=document.createElement('img');image.id='has-sidebar-employee';footer.prepend(image);}
  image.classList.add('has-sidebar-employee');image.alt='';image.setAttribute('aria-hidden','true');image.width=600;image.height=900;image.decoding='async';image.dataset.employeeArtInitialized='true';
  let previous;
  try{const saved=sessionStorage.getItem(key);if(saved!==null&&/^\d+$/.test(saved))previous=Number(saved);}catch{}
  const available=choices.map((_,index)=>index).filter(index=>index!==previous);
  const next=available[Math.floor(Math.random()*available.length)];
  image.onerror=()=>{image.hidden=true;};
  image.src='/assets/pbb/staff/sidebar-'+choices[next]+'-v2.webp';
  try{sessionStorage.setItem(key,String(next));}catch{}
 }
})();
