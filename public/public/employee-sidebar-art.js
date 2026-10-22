(() => {
 const choices=['tablet-asian-man','welcome-woman','wave-asian-woman','arms-asian-man','arms-woman','arms-asian-woman'];
 const key='has-pbb-sidebar-v1';
 for(const footer of document.querySelectorAll('.profile-sidebar .sidebar-airport,.has-sidebar .has-sidebar-bottom')){
  let image=footer.querySelector('#has-sidebar-employee');
  if(image?.dataset.employeeArtInitialized==='true')continue;
  if(!image){image=document.createElement('img');image.id='has-sidebar-employee';footer.prepend(image);}
  image.classList.add('has-sidebar-employee');image.alt='';image.setAttribute('aria-hidden','true');image.width=420;image.height=1000;image.decoding='async';image.dataset.employeeArtInitialized='true';
  let previous;
  try{const saved=sessionStorage.getItem(key);if(saved!==null&&/^\d+$/.test(saved))previous=Number(saved);}catch{}
  const next=Number.isInteger(previous)?(previous+1)%choices.length:Math.floor(Math.random()*choices.length);
  image.onerror=()=>{image.hidden=true;};
  image.src='/assets/pbb/staff/sidebar-'+choices[next]+'-v1.webp';
  try{sessionStorage.setItem(key,String(next));}catch{}
 }
})();
