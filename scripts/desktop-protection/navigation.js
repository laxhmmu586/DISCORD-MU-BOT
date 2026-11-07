(()=>{function initialize(){
  if(!window.mufcDesktop||location.pathname==='/login.html')return;
  const entries=[['REPORT','/report.html'],['BAGGAGE','/baggage.html'],['LBS','/cbs.html'],['NOTES','/notes.html'],['FORM','/index.html#forms']];
  const header=document.querySelector('body > header');
  if(header){
    let nav=header.querySelector('nav');
    if(!nav){nav=document.createElement('nav');const brand=header.querySelector('.brand,.flight-brand');if(brand)brand.after(nav);else header.prepend(nav);}
    nav.classList.add('desktop-primary-nav');nav.setAttribute('aria-label','Primary navigation');
    // Old headers and legacy desktop adapters can contribute links outside their nav.
    header.querySelectorAll(':scope > a').forEach(a=>{if(!a.matches('.brand,.flight-brand,.flight-switch,#home-nav-link'))a.remove();});
    const form=document.querySelector('[data-open-flight-forms]');
    const create=([label,href])=>{
      if(label==='FORM'&&location.pathname==='/index.html'&&form){form.hidden=false;form.textContent='FORM';return form;}
      const a=document.createElement('a');a.href=href;a.textContent=label;if(location.pathname===href)a.setAttribute('aria-current','page');return a;
    };
    nav.replaceChildren(...entries.map(create));
    const mobile=document.querySelector('.mobile-panel');if(mobile){const links=document.createElement('nav');links.className='desktop-primary-nav';links.append(...entries.map(([label,href])=>{const a=document.createElement('a');a.href=href;a.textContent=label;return a;}));mobile.querySelectorAll('a,[data-open-flight-forms]').forEach(el=>el.remove());mobile.prepend(links);}
  }
  document.querySelectorAll('[data-report-mode="spml"],[data-report-mode="wch"],[data-report-mode="missConnection"],[data-local-report]').forEach(el=>el.remove());
  const initialHash=window.mufcDesktopInitialHash||location.hash;
  if(location.pathname==='/index.html'&&initialHash==='#reports'){location.replace('/report.html');return;}
  if(location.pathname==='/index.html'&&initialHash==='#forms'){
    const opener=document.querySelector('[data-open-flight-forms]');if(opener){opener.hidden=false;opener.click();history.replaceState(null,'',location.pathname+location.search);}
  }
  // Keep legacy deep links and shortcuts on the same independent Report Center page.
  document.addEventListener('click',event=>{const link=event.target.closest('a[href="#reports"],a[href="/index.html#reports"]');if(!link)return;event.preventDefault();event.stopImmediatePropagation();location.assign('/report.html');},true);
  if(location.pathname==='/report.html')document.body.classList.add('desktop-report-center');
}if(document.readyState==='complete')initialize();else document.addEventListener('DOMContentLoaded',initialize,{once:true});})();
