(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.emergencyNotification=factory();})(typeof globalThis==='object'?globalThis:this,()=>{
 const calls=[
  {number:1,ordinal:'1st',title:'Airport Police',phone:'call1Phone',legacyPhone:'paragraph_7'},
  {number:2,ordinal:'2nd',title:'Account Business Manager or Sr. Supervisor',name:'call2Name',phone:'call2Phone',legacyName:'paragraph_10',legacyPhone:'paragraph_11'},
  {number:3,ordinal:'3rd',title:'Client Station Manager/Duty Manager',name:'call3Name',phone:'call3Phone',legacyName:'paragraph_14',legacyPhone:'paragraph_15'},
  {number:4,ordinal:'4th',title:'Regional Operation Manager, General Manager, Airport Operations Manager',name:'call4Name',phone:'call4Phone',legacyName:'paragraph_18',legacyPhone:'paragraph_19',select:true},
  {number:5,ordinal:'5th',title:'Corporate Safety Manager',name:'call5Name',phone:'call5Phone',legacyName:'paragraph_22',legacyPhone:'paragraph_23',defaultName:'Matthew Overmyer',defaultPhone:'949-648-2449'},
  {number:6,ordinal:'6th',title:'VP of Operations',name:'call6Name',phone:'call6Phone',legacyName:'paragraph_26',legacyPhone:'paragraph_27',defaultName:'Oscar Yiu',defaultPhone:'347-806-0039'},
  {number:7,ordinal:'7th',title:'VP of Human Resources',name:'call7Name',phone:'call7Phone',legacyName:'paragraph_30',legacyPhone:'paragraph_31',defaultName:'Paula Hooks',defaultPhone:'310-339-4207'}
 ];
 const fields=calls.flatMap(call=>[...(call.name?[{key:call.name,label:'Name',maxLength:160}]:[]),{key:call.phone,label:'Phone',maxLength:80}]);
 function normalize(values={}){const result={};for(const call of calls)for(const type of ['name','phone']){const key=call[type];if(!key)continue;const legacy=values[call[type==='name'?'legacyName':'legacyPhone']];result[key]=values[key]??(legacy===undefined?call[type==='name'?'defaultName':'defaultPhone']||'':String(legacy).replace(type==='name'?/^\s*Name:\s*/i:/^[\s\S]*?Phone:\s*/i,'').trim());}return result;}
 return {calls,fields,normalize};
});
