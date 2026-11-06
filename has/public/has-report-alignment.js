(() => {
 'use strict';
 let iconSerial=0;
 function icon(name){
  const id='report-blue-'+(++iconSerial),gradient='url(#'+id+'-ink)',shadow='url(#'+id+'-shadow)';
  const bars=side=>[0,1,2,3].map((r)=>{const w=r%2?14:22,x=side==='left'?5:side==='right'?27-w:(32-w)/2;return '<rect x="'+x+'" y="'+(6+r*6)+'" width="'+w+'" height="3.5" rx="1.4"/>';}).join('');
  const shapes={
   undo:'<path d="M13 4 3 12l10 8v-5h3c6 0 9 4 9 10 5-10 0-17-9-17h-3Z"/>',
   redo:'<path transform="translate(32 0) scale(-1 1)" d="M13 4 3 12l10 8v-5h3c6 0 9 4 9 10 5-10 0-17-9-17h-3Z"/>',
   bold:'<path fill-rule="evenodd" d="M8 4h9c9 0 11 10 4 12 8 2 6 13-3 13H8Zm6 5v5h3c4 0 4-5 0-5Zm0 10v5h4c4 0 4-5 0-5Z"/>',
   italic:'<path d="M13 4h14v5h-4l-7 15h4v5H6v-5h4l7-15h-4Z"/>',
   underline:'<path d="M7 4h5v12c0 7 8 7 8 0V4h5v12c0 13-18 13-18 0Zm-1 23h20v3H6Z"/>',
   left:bars('left'),center:bars('center'),right:bars('right'),
   fill:'<path d="m12 4 13 13-10 10a4 4 0 0 1-5 0L3 20a4 4 0 0 1 0-5Z"/><path d="M27 18s-4 5-4 7a4 4 0 0 0 8 0c0-2-4-7-4-7Z"/><path d="m9 3 10 10" fill="none" stroke="#e7fbff" stroke-width="2.2" stroke-linecap="round"/><path d="M6 19h15" fill="none" stroke="#b8f3ff" stroke-width="2"/>',
   color:'<path fill-rule="evenodd" d="M12 3h8l10 23h-7l-2-5H11l-2 5H2Zm4 6-3 7h6Z"/>'
  };
  return '<svg class="report-tool-icon" viewBox="0 0 34 34" width="28" height="28" aria-hidden="true" focusable="false"><defs><linearGradient id="'+id+'-ink" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#8cecff"/><stop offset=".38" stop-color="#19b8ff"/><stop offset=".7" stop-color="#0784f5"/><stop offset="1" stop-color="#2361de"/></linearGradient><filter id="'+id+'-shadow" x="-35%" y="-25%" width="180%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation=".8" flood-color="#0964bd" flood-opacity=".32"/></filter></defs><g fill="'+gradient+'" stroke="#1686e1" stroke-width=".45" stroke-linejoin="round" filter="'+shadow+'">'+(shapes[name]||shapes.center)+'</g></svg>';
 }
 const properties={align:'text-align',vertical:'vertical-align',color:'color',fill:'background-color',bold:'font-weight',italic:'font-style',underline:'text-decoration'};
 function paint(root,formats={}){for(const input of root.querySelectorAll('[data-cell-input],[data-recharge-cell]')){const a=input.dataset.cellInput||input.dataset.rechargeCell,f=formats[a]||{},host=input.closest('td')||input.parentElement;for(const [k,p] of Object.entries(properties)){const value=k==='bold'?(f[k]?'700':'400'):k==='italic'?(f[k]?'italic':'normal'):k==='underline'?(f[k]?'underline':'none'):f[k]||(k==='align'?'center':k==='vertical'?'middle':k==='color'?'#111':'transparent');(k==='vertical'?host.style:input.style).setProperty(p,value,'important');}}}
 function mount(host,options={}){const {root,getTargets=()=>[],getFormats=()=>({}),onChange=()=>{},isBusy=()=>false}=options;let active;const toolbar=document.createElement('div');toolbar.className='report-alignment-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Cell formatting');
 if(root)root.addEventListener('focusin',e=>{if(e.target.matches('[data-cell-input],[data-recharge-cell]')){active=e.target.dataset.cellInput||e.target.dataset.rechargeCell;update();}});
 const targets=()=>{const selected=getTargets();return options.getTargets?selected:active?[active]:[];};
 function apply(patch){if(isBusy())return;const cells=targets();if(!cells.length)return;const formats=getFormats(),changes={};for(const a of cells)changes[a]={...formats[a],...patch};onChange(changes);update();}
 function update(){const f=getFormats()[targets()[0]]||{};for(const button of toolbar.querySelectorAll('[data-format-key]')){button.disabled=isBusy()||!targets().length;const key=button.dataset.formatKey,value=button.dataset.formatValue;button.setAttribute('aria-pressed',String(value?((f[key]||(key==='align'?'center':'middle'))===value):Boolean(f[key])));}for(const label of toolbar.querySelectorAll('[data-color-key]')){const k=label.dataset.colorKey;label.style.setProperty('--report-swatch',f[k]||(k==='fill'?'#ffff00':'#000000'));const input=label.querySelector('input');input.disabled=isBusy()||!targets().length;input.value=f[k]||(k==='fill'?'#ffff00':'#000000');} }
 const specs=[['bold','Bold','B'],['italic','Italic','I'],['underline','Underline','U'],['align','Align left','☰','left'],['align','Align center','☰','center'],['align','Align right','☰','right']];
 for(const [key,label,text,value] of specs){const button=document.createElement('button');button.type='button';button.title=label;button.setAttribute('aria-label',label);button.dataset.formatKey=key;if(value)button.dataset.formatValue=value;button.innerHTML=icon(value||key);
 button.onmousedown=e=>e.preventDefault();button.onclick=()=>apply({[key]:value||!getFormats()[targets()[0]]?.[key]});toolbar.append(button);}
 for(const [key,label,value] of [['fill','Fill color','#ffff00'],['color','Font color','#000000']]){const wrap=document.createElement('label');wrap.className='report-color-control';wrap.dataset.colorKey=key;wrap.title=label;wrap.innerHTML=icon(key);const input=document.createElement('input');input.type='color';input.value=value;input.setAttribute('aria-label',label);input.oninput=()=>apply({[key]:input.value});wrap.append(input);toolbar.append(wrap);}
 host.append(toolbar);update();return {toolbar,update,paint:()=>root&&paint(root,getFormats())};
 }
 window.hasReportAlignment={mount,paint,icon};
})();
