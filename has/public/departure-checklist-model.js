(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DepartureChecklistModel=api;})(typeof globalThis==='object'?globalThis:this,function(){
 const definitions={
  avih:{name:'AVIH',title:'东航小动物运输地面检查单',subtitle:'Live Animal Ground Handling Checklist',source:'AVIH reference supplied 2026-11-02',items:[
   ['确认本航班货舱是否为有氧舱','Confirm the flight cargo compartment is oxygenated.'],
   ['确认温度符合运输标准','Confirm the temperature meets transport standards.'],
   ['确认小动物符合入境国海关要求','Confirm the animal meets destination customs requirements.'],
   ['查验小动物运输申请书、检验检疫证明；拍照存档。','Check the animal transport application and inspection/quarantine certificates; photograph and retain.'],
   ['确认小动物非扁鼻犬或扁鼻猫、斗犬、萨摩耶犬','Confirm the animal is not a snub-nosed dog or cat, fighting dog, or Samoyed.'],
   ['检查小动物装载容器为专用航空宠物托运箱，容器材质、通风口等是否符合规定。','Check that the dedicated air transport kennel, materials and ventilation meet requirements.'],
   ['检查小动物容器的尺寸是否符合规定，以保证小动物可在箱中自由站立或坐下、转身和以正常姿势躺卧。','Check kennel dimensions allow the animal to stand or sit freely, turn around and lie down normally.'],
   ['检查远程航线（超过6小时）是否配小动物饮水器。','For routes over 6 hours, check that an animal drinking device is provided.'],
   ['检查容器有闭锁装置，使用自锁式尼龙扎带加固。','Check the locking device and reinforce with self-locking nylon cable ties.'],
   ['检查小动物运输容器外是否有尼龙防护网，绳子直径2mm以上。','Check the outer nylon protective net has cord diameter above 2 mm.'],
   ['检查小动物运输容器是否按“井”字型要求打包','Check that the kennel is secured with the required crisscross (井) strapping.'],
   ['确认每个独立包装的宠物和宠物箱的合计重量（含宠物箱内的食物和水）是否不超过32kg（含）','Confirm each packed animal and kennel, including food and water, weighs no more than 32 kg.'],
   ['填写《特种行李机长通知》，与行李运输人员交接。','Complete the special baggage captain notification and hand over to baggage transport staff.'],
   ['航班起飞____分钟后，派发小动物电报','Send the live animal telegram ____ minutes after departure.'],
   ['将包装完好的小动物、保护网、托运箱、“井”字型打包拍照存档。','Photograph and retain the fully packed animal, protective net, kennel and crisscross strapping.']
  ]},
  'service-dog':{name:'SERVICE DOG',title:'洛杉矶站服务犬（仅限导盲犬、助听犬）收运检查单',subtitle:'Los Angeles Station Service Dog (Guide Dogs and Hearing Dogs Only) Acceptance and Transport Checklist',source:'Service Dog Checklist 20260412.pdf',sourceUrl:'https://drive.google.com/file/d/1ApV6-SKNtVYacc2dQHvq7VAvdnhSiVPx/view',items:[
   ['原件：服务犬有效的工作证明（《动物训练合格证明书》、《动物工作证》或《动物身份证》）','Original copy: Valid work certificate for the service dog (Animal Training Qualification Certificate, Animal Work Certificate or Animal ID Card).'],
   ['原件：政府相关职能部门出具的《动物检疫合格证明》','Original copy: Animal Quarantine Qualification Certificate issued by relevant government authorities.'],
   ['原件：狂犬病疫苗接种证书（国际）','Original copy: International rabies vaccination certificate.'],
   ['宠物应当具有电子芯片，芯片须符合国际标准ISO 11784和11785','The pet must be implanted with a microchip that complies with international standards ISO 11784 and 11785.'],
   ['携带人提供相应使用者证明（医疗机构出具的视觉、听力障碍证明或需要使用服务犬的证明），如无法提供则需要提供中国海关对普通宠物入境所需的指定采信实验室出具的狂犬病抗体检测报告（抗体滴度或免疫抗体量须在0.5IU/ml以上）','Passenger shall provide corresponding user certification (visual or hearing impairment certificate issued by a medical institution, or certificate proving the need to use a service dog). If such certification cannot be provided, a rabies antibody test report issued by a designated accredited laboratory required by China Customs for ordinary pet entry shall be provided (antibody titer or immune antibody level shall be above 0.5 IU/ml).'],
   ['《服务性动物运输申请书》','Service Animal Transport Application Form.'],
   ['《美国交通部服务犬运输申请单》','U.S. Department of Transportation Service Dog Transport Application Form.'],
   ['《美国交通部服务犬排泄行为可控证明》','U.S. Department of Transportation Service Dog Controllable Elimination Behavior Certificate.'],
   ['当旅客与其服务犬同机旅行时，应安排在相应舱位的第一排座位或其他适合的座位（不得安排紧急出口）。如没有第一排座位，尽量多预留1个额外座位。','When a passenger travels with their service dog on the same flight, they shall be arranged in the first row of the corresponding cabin or other suitable seats (emergency exit seats are prohibited). If no first-row seat is available, reserve one extra seat as much as possible.'],
   ['柜台检查口套、牵引绳。应在登机前为其戴上口套、系上牵引绳索，登机口2次检查。','Check the muzzle and leash at the counter. The service dog shall be muzzled and leashed before boarding, with a second check at the boarding gate.'],
   ['填写《特种行李机长通知单》','Fill in the Special Baggage Captain Notification Form.'],
   ['航班起飞后拍发PETC电报','Send PETC telegram after flight departure.']
  ]}
 };
 for(const [type,def] of Object.entries(definitions)){def.type=type;def.revision=0;def.items=def.items.map(([zh,en],i)=>({id:type+'-'+(i+1),zh,en}));}
 const fields={passenger:'Passenger name / 旅客姓名',seat:'Seat / 座位',route:'Route / 航段',animal:'Animal / 动物',officer:'Check-in agent / 值机员',supervisor:'Supervisor / 分管领导',telegramMinutes:'Telegram minutes after departure / 起飞后分钟',notes:'Notes / 备注'};
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function blank(type,template=definitions[type]){if(!Object.hasOwn(definitions,type))throw Error('Choose AVIH or SERVICE DOG.');return {revision:0,template,values:Object.fromEntries(Object.keys(fields).map(key=>[key,''])),checks:template.items.map(()=>false)};}
 function printHtml(state){
  const def=state.template||definitions[state.type],values=state.values,pages=[];let offset=0;
  // Keep the supplied service-dog template on two sheets; long or expanded
  // templates may flow onto additional pages without splitting an item.
  const size=state.type==='service-dog'?7:15;for(let i=0;i<def.items.length;i+=size)pages.push(def.items.slice(i,i+size));
  return pages.map((items,index)=>{const start=offset;offset+=items.length;return '<article class="cl-paper '+(state.type==='avih'?'cl-avih':'cl-service')+'"><header><p class="cl-print-eyebrow">CHINA EASTERN · LAX / MU · '+esc(def.name)+'</p><h1>'+esc(def.title)+'</h1><p>'+esc(def.subtitle)+'</p></header><div class="cl-print-fields">'+[['Flight / 航班',state.flight],['Date / 日期',state.date],['Route / 航段',values.route],['Passenger / 旅客',values.passenger],['Seat / 座位',values.seat],['Animal / 动物',values.animal]].map(([label,value])=>'<div><b>'+label+'</b><span>'+esc(value)+'</span></div>').join('')+'</div><table><colgroup><col style="width:6%"><col style="width:41%"><col style="width:46%"><col style="width:7%"></colgroup><thead><tr><th>No.</th><th>检查项</th><th>Checklist</th><th>完成</th></tr></thead><tbody>'+items.map(({id,zh,en},i)=>{const no=start+i;const fill=text=>id==='avih-14'?text.replace('____',values.telegramMinutes||'____'):text;return '<tr'+(id==='service-dog-10'?' class="cl-important"':'')+'><td>'+(no+1)+'</td><td>'+esc(fill(zh))+'</td><td>'+esc(fill(en))+'</td><td class="cl-print-tick">'+(state.checks[no]?'☑':'☐')+'</td></tr>';}).join('')+'</tbody></table>'+(index===pages.length-1?'<div class="cl-print-notes"><b>Notes / 备注</b><p>'+esc(values.notes)+'</p></div><footer><span>值机员 / Agent: '+esc(values.officer)+'</span><span>分管领导 / Supervisor: '+esc(values.supervisor)+'</span></footer>':'')+'<p class="cl-page-number">Template v'+def.revision+' · Sheet '+(index+1)+' / '+pages.length+'</p></article>';}).join('');
 }
 return {definitions,fields,blank,esc,printHtml};
});
