(() => {
 if(!document.body.hasAttribute('data-mufc-da'))return;
 document.addEventListener('click',event=>{
  if(!event.target.closest('.home-brand,.profile-brand,.has-brand,.flight-brand,header .brand'))return;
  event.preventDefault();event.stopImmediatePropagation();
  location.assign('/mufc-return');
 },true);
})();
