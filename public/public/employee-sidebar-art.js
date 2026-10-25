(() => {
 const choices=['tablet-asian-man','welcome-woman','wave-asian-woman','arms-asian-man','arms-woman','arms-asian-woman','arms-purple-scarf-woman','arms-glenn-man','arms-glasses-man','arms-grace-woman','arms-kelven-man','arms-glasses-woman','arms-victoria-woman'];
 const key='has-pbb-sidebar-v1';
 // Visible figure bounds in the four wide transparent canvases. Position the
 // original images inside a fixed frame, preserving their aspect ratios.
 const crops={'arms-grace-woman':[420,630,127,8,324,618],'arms-kelven-man':[420,630,115,9,315,624],'arms-glasses-woman':[420,630,122,13,289,621],'arms-victoria-woman':[420,630,140,10,290,616]};
 for(const footer of document.querySelectorAll('.profile-sidebar .sidebar-airport,.has-sidebar .has-sidebar-bottom')){
  let image=footer.querySelector('#has-sidebar-employee');
  if(image?.dataset.employeeArtInitialized==='true')continue;
  if(!image){image=document.createElement('img');image.id='has-sidebar-employee';footer.prepend(image);}
  image.classList.add('has-sidebar-employee');image.alt='';image.setAttribute('aria-hidden','true');image.width=420;image.height=1000;image.decoding='async';image.dataset.employeeArtInitialized='true';
  let previous;
  try{const saved=sessionStorage.getItem(key);if(saved!==null&&/^\d+$/.test(saved))previous=Number(saved);}catch{}
  const next=Number.isInteger(previous)?(previous+1)%choices.length:Math.floor(Math.random()*choices.length);
  const crop=crops[choices[next]];let frame;
  if(crop){
   const [width,height,left,top,right,bottom]=crop,visibleHeight=bottom-top;
   frame=document.createElement('div');frame.className='has-sidebar-employee-frame';frame.setAttribute('aria-hidden','true');image.before(frame);frame.append(image);
   frame.style.setProperty('--portrait-height',String(height/visibleHeight));frame.style.setProperty('--portrait-top',String(top/visibleHeight));frame.style.setProperty('--portrait-center',String((left+right)/(2*width)));
  }
  image.onerror=()=>{image.hidden=true;if(frame)frame.hidden=true;};
  image.src='/assets/pbb/staff/sidebar-'+choices[next]+'-v1.webp';
  try{sessionStorage.setItem(key,String(next));}catch{}
 }
})();
