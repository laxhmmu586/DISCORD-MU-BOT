(() => {
  const css=document.createElement('link');css.rel='stylesheet';css.href='/has/employee-picker.css?v=1';document.head.append(css);
  const scopeLabel=value=>value==='HQ'?'Headquarter':value;
  const sorted=values=>[...new Set(values)].sort((a,b)=>a==='HQ'?-1:b==='HQ'?1:a.localeCompare(b));
  window.EmployeePicker={open({people,title='Transfer request'}){
    return new Promise(resolve=>{
      let station='',account='',selected=null;
      const dialog=document.createElement('dialog');dialog.className='employee-picker-dialog';dialog.setAttribute('aria-label',title);
      dialog.innerHTML='<header><div><h2></h2><p>Choose Station → Account → Employee</p></div><button type="button" data-picker-close aria-label="Close transfer picker">×</button></header><div class="employee-picker-columns"><section aria-label="Stations"><h3>Station</h3><div data-picker-stations></div></section><section aria-label="Accounts"><h3>Account</h3><div data-picker-accounts></div></section><section aria-label="Employees"><h3>Employee</h3><input type="search" placeholder="Find an employee…" aria-label="Find transfer employee"><div data-picker-people></div></section></div><footer><p data-picker-selection>Select who will receive this request.</p><button type="button" data-picker-cancel>Cancel</button><button type="button" data-picker-confirm disabled>Transfer</button></footer>';
      dialog.querySelector('h2').textContent=title;
      const scopes=person=>{const headquarter=window.employeePositions?.groups.find(group=>group.label==='Headquarters')?.positions.includes(window.employeePositions.normalize(person.position));return [{station:headquarter?'HQ':person.station||'HQ',account:headquarter?'HQ':person.account||'HQ'},...(person.additionalAccounts||[])];};
      const list=selector=>dialog.querySelector(selector);
      const finish=value=>{resolve(value);dialog.close();dialog.remove();};
      function choices(host,values,current,attribute,choose){
        host.replaceChildren(...values.map(value=>{const button=document.createElement('button');button.type='button';button.textContent=scopeLabel(value);button.setAttribute(attribute,value);button.setAttribute('aria-pressed',String(value===current));button.onclick=()=>choose(value);return button;}));
      }
      function draw(){
        choices(list('[data-picker-stations]'),sorted(people.flatMap(person=>scopes(person).map(s=>s.station))),station,'data-picker-station',value=>{station=value;account='';selected=null;list('input').value='';draw();});
        choices(list('[data-picker-accounts]'),station?sorted(people.flatMap(person=>scopes(person).filter(s=>s.station===station).map(s=>s.account))):[],account,'data-picker-account',value=>{account=value;selected=null;list('input').value='';draw();});
        list('input').disabled=!account;
        const query=list('input').value.toLowerCase(),matches=account?people.filter(person=>scopes(person).some(s=>s.station===station&&s.account===account)&&(person.name+' '+(person.nickname||'')+' '+person.position).toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name)):[];
        list('[data-picker-people]').replaceChildren(...matches.map(person=>{const button=document.createElement('button');button.type='button';button.dataset.pickerPerson=person.id;button.setAttribute('aria-pressed',String(selected?.id===person.id));const name=document.createElement('strong'),position=document.createElement('small');name.textContent=person.nickname||person.name;position.textContent=person.position||'';button.append(name,position);button.onclick=()=>{selected=person;draw();};return button;}));
        if(!account)list('[data-picker-people]').textContent=station?'Select an Account first.':'Select a Station first.';
        else if(!matches.length)list('[data-picker-people]').textContent='No matching employees.';
        list('[data-picker-confirm]').disabled=!selected;
        list('[data-picker-selection]').textContent=selected?'Transfer to '+selected.name+' · '+scopeLabel(station)+' / '+scopeLabel(account):'Select who will receive this request.';
      }
      list('input').oninput=draw;
      list('[data-picker-confirm]').onclick=()=>finish(selected.id);
      list('[data-picker-close]').onclick=list('[data-picker-cancel]').onclick=()=>finish(null);
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      document.body.append(dialog);draw();dialog.showModal();
    });
  }};
})();
