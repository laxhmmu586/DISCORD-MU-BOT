(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BriefingMembership=factory();})(typeof globalThis==='object'?globalThis:this,()=>{
 const legacyMembershipLabels={"\u767d\u91d1\u5361 \u00b7 Platinum / V": "Platinum / V", "\u91d1\u5361 \u00b7 Gold / G": "Gold / G", "\u94f6\u5361 \u00b7 Silver / S": "Silver / S", "\u8d85\u7ea7\u7cbe\u82f1 \u00b7 Elite Plus / *2": "Elite Plus / *2", "\u666e\u901a\u7cbe\u82f1 \u00b7 Elite / *1": "Elite / *1", "\u989d\u5916\u884c\u674e \u00b7 Extra bags": "Extra bags", "\u4f18\u5148\u884c\u674e\u724c \u00b7 Priority tag": "Priority tag", "\u8d35\u5bbe\u5ba4 \u00b7 Lounge": "Lounge", "\u540c\u884c\u5bbe\u5ba2 \u00b7 Guest": "Guest", "\u5ea7\u4f4d \u00b7 Seat": "Seat"};
 const englishLabel=value=>legacyMembershipLabels[String(value).trim()]||value;
 const tiers={
  platinum:{label:'Platinum',name:'Platinum / V',sky:'SkyTeam Elite Plus',cabins:{all:['1 × 32 kg','Yellow + Purple','Yes','1 guest','Free']}},
  gold:{label:'Gold',name:'Gold / G',sky:'SkyTeam Elite Plus',cabins:{business:['1 × 32 kg','Yellow','Yes','1 guest','Pay'],economy:['1 × 32 kg','Yellow','Yes','No','Pay']}},
  silver:{label:'Silver',name:'Silver / S',sky:'SkyTeam Elite',cabins:{business:['1 × 32 kg','Yellow','Yes','No','Pay'],economy:['1 × 23 kg','Purple','Yes','No','Pay']}},

  elitePlus:{label:'Elite Plus / *2',name:'Elite Plus / *2',sky:'SkyTeam Elite Plus',cabins:{business:['1 × 32 kg','Yellow','Yes','1 guest','Pay'],economy:['1 × 23 kg','Yellow','Yes','1 guest','Pay']}},
  elite:{label:'Elite / *1',name:'Elite / *1',sky:'SkyTeam Elite',cabins:{business:['1 × 32 kg','—','No','—','Pay'],economy:['1 × 23 kg','—','No','—','Pay']}}
 };

 const labels=['Extra bags','Priority tag','Lounge','Guest','Seat'];
 function rows(reference={}){
  const saved=reference.values||{};
  return Object.entries(tiers).flatMap(([key,tier])=>Object.entries(tier.cabins).map(([cabin,benefits])=>{
   const base='membership.'+key+'.'+(cabin==='all'?'business':cabin)+'.';
   const value=(index,fallback)=>Object.hasOwn(saved,base+index)?englishLabel(saved[base+index]):fallback;
   return {tier:value(0,tier.name),sky:value(1,tier.sky),cabin:cabin==='all'?'All cabins':cabin==='business'?'Business':'Economy',benefits:labels.map((label,i)=>({label:value(2+i*2,label),value:value(3+i*2,benefits[i])}))};
  }));
 }
 const cells=row=>[row.tier,row.sky,row.cabin,...row.benefits.map((benefit,i)=>benefit.label===labels[i]?benefit.value:benefit.label+': '+benefit.value)];
 return {tiers,englishLabel,rows,cells,headers:['Membership','SkyTeam','Cabin',...labels],notice:'SkyTeam Elite cards do not include lounge access.'};
});
