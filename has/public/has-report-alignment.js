(() => {
 'use strict';
 const key='has-report-alignment-v1';let mode={horizontal:'center',vertical:'middle'};
 try{const saved=JSON.parse(localStorage.getItem(key)||'{}');if(['left','center','right'].includes(saved.horizontal))mode.horizontal=saved.horizontal;if(['top','middle','bottom'].includes(saved.vertical))mode.vertical=saved.vertical;}catch{}
 function update(){document.documentElement.style.setProperty('--report-edit-align',mode.horizontal);document.documentElement.style.setProperty('--report-edit-valign',mode.vertical);for(const button of document.querySelectorAll('[data-report-alignment]'))button.setAttribute('aria-pressed',String(mode[button.dataset.axis]===button.dataset.reportAlignment));}
 function mount(host){const toolbar=document.createElement('div');toolbar.className='report-alignment-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Editor alignment');
 for(const [axis,value,label,path] of [
 ['horizontal','left','Align left','M3 4h14M3 8h9M3 12h14M3 16h9'],['horizontal','center','Align center','M3 4h14M6 8h8M3 12h14M6 16h8'],['horizontal','right','Align right','M3 4h14M8 8h9M3 12h14M8 16h9'],
 ['vertical','top','Align top','M3 3h14M6 7h8M6 10h8M6 13h8'],['vertical','middle','Align middle','M3 10h14M6 4h8M6 7h8M6 13h8M6 16h8'],['vertical','bottom','Align bottom','M3 17h14M6 7h8M6 10h8M6 13h8']]){
 const button=document.createElement('button');button.type='button';button.title=label;button.setAttribute('aria-label',label);button.dataset.axis=axis;button.dataset.reportAlignment=value;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('width','20');svg.setAttribute('height','20');svg.setAttribute('aria-hidden','true');const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',path);line.setAttribute('stroke','currentColor');line.setAttribute('fill','none');svg.append(line);button.append(svg);
 button.onclick=()=>{mode[axis]=value;try{localStorage.setItem(key,JSON.stringify(mode));}catch{}update();};toolbar.append(button);
 }host.append(toolbar);update();return toolbar;}
 window.hasReportAlignment={mount};update();
})();
