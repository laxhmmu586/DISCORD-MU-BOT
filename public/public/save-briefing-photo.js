(()=>{
 // Device menus own the final save to Photos; browsers cannot write the album directly.
 window.saveBriefingPhoto=async(blob,filename)=>{
  const file=new File([blob],filename,{type:'image/png'});
  let shareable=false;try{shareable=Boolean(navigator.share&&navigator.canShare?.({files:[file]}));}catch{}
  const mobile=navigator.maxTouchPoints>0||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const share=()=>navigator.share({files:[file]});
  if(mobile&&shareable){try{await share();return 'shared';}catch(error){if(error.name==='AbortError')return 'cancelled';}}
  const url=URL.createObjectURL(blob);
  const download=()=>{const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();};
  if(mobile){
   const dialog=document.createElement('dialog');dialog.className='briefing-photo-save';
   dialog.innerHTML='<header><h2>Save briefing photo</h2><button type="button" data-close>Close</button></header><p>Touch and hold the image, then choose Save Image / Add to Photos.</p><div class="photo-save-actions"><button type="button" data-share>Save to Photos…</button><button type="button" data-download>Download image</button></div><img alt="Briefing image to save to Photos">';
   dialog.querySelector('img').src=url;const shareButton=dialog.querySelector('[data-share]');shareButton.hidden=!shareable;
   shareButton.onclick=async()=>{shareButton.disabled=true;try{await share();}catch(error){if(error.name!=='AbortError')dialog.querySelector('p').textContent='Touch and hold the image below to save it to Photos.';}finally{shareButton.disabled=false;}};
   dialog.querySelector('[data-download]').onclick=download;dialog.querySelector('[data-close]').onclick=()=>dialog.close();
   dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);dialog.remove();},{once:true});document.body.append(dialog);dialog.showModal();return 'preview';
  }
  download();setTimeout(()=>URL.revokeObjectURL(url),60000);return 'downloaded';
 };
})();
