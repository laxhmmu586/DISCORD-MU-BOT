(()=>{
 let active=false;
 async function crop(file){
  if(active)throw Error('Finish cropping the current photo first.');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP photo.');
  if(file.size>20*1024*1024)throw Error('Choose a photo up to 20 MB.');
  active=true;const url=URL.createObjectURL(file),image=new Image();
  try{
   image.src=url;await image.decode();if(image.naturalWidth*image.naturalHeight>60000000)throw Error('Choose a photo up to 60 megapixels.');
   return await new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='avatar-crop-dialog';dialog.setAttribute('aria-labelledby','avatar-crop-title');
    dialog.innerHTML='<div class="edit-dialog-heading"><h2 id="avatar-crop-title">Crop profile photo</h2><button type="button" data-crop-cancel aria-label="Close photo crop">×</button></div><p>Move and zoom the photo to fit your face inside the frame.</p><div class="avatar-crop-frame"><canvas width="600" height="600" tabindex="0" role="img" aria-label="Photo crop preview. Drag to move the photo, or use arrow keys."></canvas><span class="avatar-crop-guides" aria-hidden="true"></span></div><label class="avatar-crop-zoom">Zoom<input type="range" min="1" max="5" step="0.01" value="1" aria-label="Photo zoom"></label><div class="profile-actions"><button type="button" data-crop-reset>Reset</button><button type="button" data-crop-cancel>Cancel</button><button type="button" data-crop-apply class="profile-primary">Use photo</button></div>';
    const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d'),slider=dialog.querySelector('input'),size=600,base=Math.max(size/image.naturalWidth,size/image.naturalHeight);
    let zoom=1,x=0,y=0,drag;
    const draw=()=>{const w=image.naturalWidth*base*zoom,h=image.naturalHeight*base*zoom;x=Math.max((size-w)/2,Math.min((w-size)/2,x));y=Math.max((size-h)/2,Math.min((h-size)/2,y));ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.drawImage(image,(size-w)/2+x,(size-h)/2+y,w,h);};
    const finish=value=>{dialog.close();dialog.remove();resolve(value);};
    dialog.querySelectorAll('[data-crop-cancel]').forEach(b=>b.onclick=()=>finish(null));dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    dialog.querySelector('[data-crop-reset]').onclick=()=>{zoom=1;x=y=0;slider.value='1';draw();};
    slider.oninput=()=>{const next=Number(slider.value),ratio=next/zoom;x*=ratio;y*=ratio;zoom=next;draw();};
    canvas.onpointerdown=event=>{drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);};
    canvas.onpointermove=event=>{if(!drag||drag.id!==event.pointerId)return;const ratio=size/canvas.getBoundingClientRect().width;x+=(event.clientX-drag.x)*ratio;y+=(event.clientY-drag.y)*ratio;drag.x=event.clientX;drag.y=event.clientY;draw();};
    canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
    canvas.onkeydown=event=>{const moves={ArrowLeft:[-15,0],ArrowRight:[15,0],ArrowUp:[0,-15],ArrowDown:[0,15]},move=moves[event.key];if(!move)return;event.preventDefault();x+=move[0];y+=move[1];draw();};
    dialog.querySelector('[data-crop-apply]').onclick=()=>{const output=document.createElement('canvas');output.width=output.height=512;output.getContext('2d').drawImage(canvas,0,0,512,512);finish(output.toDataURL('image/jpeg',.88));};
    document.body.append(dialog);draw();dialog.showModal();canvas.focus();
   });
  }catch(error){throw Error(error.message==='The source image cannot be decoded.'?'Unable to open this photo. Choose a valid PNG, JPEG or WebP image.':error.message);}
  finally{URL.revokeObjectURL(url);active=false;}
 }
 window.ProfileAvatarCropper={crop};
})();
