// Dedicated window chrome; never cover the page's fixed navigation.
(() => {
  if (!window.mufcDesktop?.windowControl || window.top !== window) return;
  const bar=document.createElement('div');bar.className='mufc-window-bar';bar.setAttribute('aria-label','MUFC window');
  const icons={minimize:'<path d="M3 8.5h10"/>',maximize:'<rect x="3.5" y="3.5" width="9" height="9"/>',restore:'<path d="M5.5 5.5v-3h8v8h-3"/><rect x="2.5" y="5.5" width="8" height="8"/>',close:'<path d="m3.5 3.5 9 9m0-9-9 9"/>'};
  const svg=name=>`<svg viewBox="0 0 16 16" aria-hidden="true">${icons[name]}</svg>`;
  bar.innerHTML='<div class="mufc-window-drag"><span>MUFC</span></div><div class="mufc-window-actions">'+['minimize','maximize','close'].map(action=>`<button type="button" data-mufc-window-action="${action}" aria-label="${action}" title="${action}">${svg(action)}</button>`).join('')+'</div>';
  const style=document.createElement('style');style.textContent=`
    :root{--mufc-window-height:32px}
    body{padding-top:calc(var(--mufc-page-padding,0px) + var(--mufc-window-height))!important;box-sizing:border-box}
    body.desktop-cbs-form{--mufc-page-padding:64px!important}
    .mufc-window-bar{position:fixed;inset:0 0 auto!important;height:var(--mufc-window-height);z-index:2147483646;display:flex;align-items:stretch;overflow:hidden;background:#061828;color:#c5d0dd;border-bottom:1px solid #ffffff16;box-sizing:border-box;font:12px/1 system-ui;user-select:none;isolation:isolate}
    .mufc-window-drag{display:flex;align-items:center;flex:1;min-width:0;-webkit-app-region:drag}
    .mufc-window-drag span{padding-left:14px;font-size:11px;font-weight:600;letter-spacing:1px}
    .mufc-window-actions{display:flex;align-items:stretch;flex:none;-webkit-app-region:no-drag}
    .mufc-window-bar .mufc-window-actions button{display:grid;place-items:center;position:static;width:46px;min-width:46px;height:100%;min-height:0;margin:0;padding:0;border:0;border-radius:0;background:transparent;color:inherit;box-shadow:none;cursor:default;-webkit-app-region:no-drag}
    .mufc-window-actions svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1;pointer-events:none}
    .mufc-window-bar .mufc-window-actions button:hover{background:#ffffff18;color:#fff}
    .mufc-window-bar .mufc-window-actions button:last-child:hover{background:#c42b1c;color:#fff}
    .mufc-window-actions button:focus-visible{outline:2px solid #8dbfff;outline-offset:-3px}
    .topbar,.desktop-cbs-topbar{top:var(--mufc-window-height)!important}
    .desktop-cbs-page>header{top:var(--mufc-window-height)!important}
    body>#mufc-login-controls,body>#mufc-settings-button{top:calc(var(--mufc-window-height) + 14px)!important}
    .mufc-settings{inset:var(--mufc-window-height) 0 0!important;max-height:calc(100dvh - var(--mufc-window-height) - 48px);overflow:auto;box-sizing:border-box}
    html:has(body.login-orbit){overflow:hidden}
    body.login-orbit{height:100dvh!important;min-height:0!important;overflow:hidden!important}
    body:has(>.flight-topbar)>main{min-height:calc(100svh - 60px - var(--mufc-window-height))}
    body:has(.timeline)>main{height:calc(100dvh - var(--mufc-window-height));min-height:calc(100dvh - var(--mufc-window-height))}
    body:has(.timeline) .hero{height:calc(100dvh - 76px - var(--mufc-window-height));min-height:calc(100dvh - 76px - var(--mufc-window-height))}
    .mufc-maximized{--mufc-window-height:0px}
    .mufc-maximized .mufc-window-bar{left:auto!important;width:138px;height:32px;background:transparent;border:0}
    .mufc-maximized .mufc-window-drag{display:none}
    .mufc-maximized>.flight-topbar,.mufc-maximized>.topbar{padding-right:154px!important}
    .mufc-maximized>#mufc-login-controls,.mufc-maximized>#mufc-settings-button{right:154px!important}
    .mufc-fullscreen{--mufc-window-height:0px}
    .mufc-fullscreen .mufc-window-bar{display:none}
    @media print{:root{--mufc-window-height:0px}.mufc-window-bar{display:none}}
  `;
  const mount=()=>{
    document.body.style.setProperty('--mufc-page-padding',getComputedStyle(document.body).paddingTop);
    document.head.append(style);document.body.append(bar);
    // Modal dialogs enter the top layer. Keep window controls in that layer too.
    const syncLayer=()=>{const host=document.querySelector('dialog:modal')||document.body;if(bar.parentElement!==host)host.append(bar);};
    new MutationObserver(syncLayer).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  const paint=state=>{document.body.classList.toggle('mufc-fullscreen',Boolean(state.fullscreen));document.body.classList.toggle('mufc-maximized',Boolean(state.maximized));const button=bar.querySelector('[data-mufc-window-action="maximize"]');button.innerHTML=svg(state.maximized?'restore':'maximize');button.title=state.maximized?'Restore':'Maximize';button.setAttribute('aria-label',button.title);};
  bar.addEventListener('click',event=>{const button=event.target.closest('[data-mufc-window-action]');if(button)void window.mufcDesktop.windowControl(button.dataset.mufcWindowAction).then(paint).catch(()=>{});});
  window.mufcDesktop.onWindowState(paint);void window.mufcDesktop.windowControl('state').then(paint).catch(()=>{});
})();
