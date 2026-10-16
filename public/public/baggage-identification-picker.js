(function () {
  const G = BaggageGuide;
  function fields() {
    return ['color','type','descriptors'].map((kind,index) => `<div class="test-field bag-id-picker" data-bag-id-picker="${kind}"><span>${['Color / 颜色','Baggage type / 行李类型','Descriptive elements / 特征'][index]}</span><input type="hidden" name="${kind}"><button type="button" data-bag-id-open>Select / 请选择</button><dialog class="bag-id-dialog" aria-label="${kind}"><button type="button" class="bag-id-close" data-bag-id-close aria-label="Close">×</button><div data-bag-id-options></div>${kind==='descriptors'?'<button type="button" class="bag-id-done" data-bag-id-close>Done / 完成</button>':''}</dialog></div>`).join('');
  }
  function options(kind) {
    const tile=(item)=>`<button type="button" class="bag-id-option" data-bag-id-code="${item[0]}" aria-pressed="false">${G.photo(item[0],kind==='descriptors'?'descriptor':kind)}<b>${item[0].replace(/-.*/, '')}</b><small>${G.escape(item[1])}<br>${G.escape(item[2])}</small></button>`;
    if(kind==='color')return `<div class="bag-id-grid">${G.colors.map(tile).join('')}</div>`;
    const groups=kind==='type'?['zipped','unzipped','other']:['material','basic','external'];
    const names=kind==='type'?['Zippered bags / 拉链行李','Un-zippered bags / 无拉链行李','Miscellaneous / 其他物品']:['Material / 材质特征','Basic / 基本特征','External / 外部特征'];
    return (kind==='type'?`<div class="bag-id-tabs">${groups.map((group,i)=>`<button type="button" data-bag-id-tab="${group}" aria-pressed="${i===0}">${names[i]}</button>`).join('')}</div>`:'<p>Select up to 3 elements / 最多选择 3 项特征</p>')+groups.map((group,i)=>`<section data-bag-id-group="${group}" ${kind==='type'&&i?'hidden':''}>${kind==='descriptors'?`<h4>${names[i]}</h4>`:''}<div class="bag-id-grid">${(kind==='type'?G.types:G.descriptors).filter(item=>item[5]===group).map(tile).join('')}</div></section>`).join('');
  }
  document.addEventListener('click',event=>{
    const picker=event.target.closest('[data-bag-id-picker]');if(!picker)return;
    const kind=picker.dataset.bagIdPicker,dialog=picker.querySelector('dialog'),input=picker.querySelector('input');
    if(event.target.closest('[data-bag-id-open]')){
      picker.querySelector('[data-bag-id-options]').innerHTML=options(kind);
      dialog.querySelectorAll('[data-bag-id-code]').forEach(button=>button.setAttribute('aria-pressed',String(input.value.split(',').includes(button.dataset.bagIdCode))));
      dialog.showModal();return;
    }
    if(event.target.closest('[data-bag-id-close]')){dialog.close();return;}
    const tab=event.target.closest('[data-bag-id-tab]');
    if(tab){dialog.querySelectorAll('[data-bag-id-group]').forEach(group=>group.hidden=group.dataset.bagIdGroup!==tab.dataset.bagIdTab);dialog.querySelectorAll('[data-bag-id-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button===tab)));return;}
    const option=event.target.closest('[data-bag-id-code]');if(!option)return;
    const code=option.dataset.bagIdCode;
    let values=input.value.split(',').filter(Boolean);
    if(kind==='descriptors'){
      if(values.includes(code))values=values.filter(value=>value!==code);
      else {
        const group=G.descriptors.find(item=>item[0]===code)[5];
        values=values.filter(value=>!(code==='X-M'&&G.descriptors.find(item=>item[0]===value)[5]==='material')&&!(code==='X-E'&&G.descriptors.find(item=>item[0]===value)[5]==='external')&&!(group==='material'&&value==='X-M')&&!(group==='external'&&value==='X-E'));
        if(values.length===3)return;
        values.push(code);
      }
    }else values=[code];
    input.value=values.join(',');
    const items=kind==='color'?G.colors:kind==='type'?G.types:G.descriptors;
    picker.querySelector('[data-bag-id-open]').textContent=values.map(value=>`${value.replace(/-.*/, '')} · ${G.label(items.find(item=>item[0]===value),'en')}`).join(', ')||'Select / 请选择';
    dialog.querySelectorAll('[data-bag-id-code]').forEach(button=>button.setAttribute('aria-pressed',String(values.includes(button.dataset.bagIdCode))));
    if(kind!=='descriptors')dialog.close();
  });
  window.BaggageIdentificationPicker={fields};
})();
