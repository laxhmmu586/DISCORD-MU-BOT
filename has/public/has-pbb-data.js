(function(root){
 const q=(id,role,phase,text,photo)=>({id,role,phase,text,photo});
 const data=[
  q('serviceable','driver','pre','The jet bridge is operational and serviceable.','has-serviceable-user-v1.webp'),
  q('controls','driver','pre','The control panel is functioning properly.','control-console.jpg'),
  q('equipment','driver','pre','The canopy, bumpers, roller door, safety shoe, and safety chain are serviceable.','has-equipment-yellow-bumper-v4.webp'),
  q('cables','spotter','pre','Power cables are properly stowed and secured.','has-cables-stowed-v1.webp'),
  q('stand','spotter','pre','The aircraft stand is free of FOD and obstructions.','safe-area-check-lax-v2.webp'),
  {...q('stopped','spotter','pre','The aircraft has come to a complete stop and aircraft chocks are in place.','aircraft-chocks-lax-v2.webp'),linkedAnswers:['chocks'],pdfText:'The aircraft has come to a complete stop.'},
  {...q('chocks','spotter','pre','Aircraft chocks are in place.','aircraft-chocks-lax-v2.webp'),hidden:true},
  q('path','spotter','pre','The jet bridge movement path remains clear.','ramp-path-realistic.webp'),
  q('floor','driver','movement','The jet bridge floor is positioned appropriately below the aircraft door sill.','floor-level-lax-v2.webp'),
  q('leveler','driver','after','I activated the auto-leveler.','auto-key-lax-v2.webp'),
  q('canopy','driver','after','I deployed and adjusted the canopy.','canopy-deployed-lax-v2.webp'),
  q('crew','driver','after','I received crew acknowledgment prior to opening the aircraft door.','has-crew-acknowledgment-v1.webp'),
  q('shoe','driver','after','I placed the safety shoe beneath the aircraft door.','safety-shoe.jpg')
 ];
 for(const item of data)item.type='arrival';
 const departure=[
 q('d1','driver','pre','Confirm aircraft door is closed per airline procedure.','airline-door-closure-lax-v2.webp'),
 q('d2','driver','pre','Remove safety shoe, if fitted; store it in its holder.','safety-shoe-storage-lax-v2.webp'),
 q('d3','driver','pre','Pull the safety chain across the bridge opening and secure it.','safety-chain-lax-v2.webp'),
 q('d4','driver','pre','Turn the key to OPERATE and retract the canopy.','operate-key-lax-v2.webp'),
 q('d6','spotter','pre','Double-check the area is safe.','safe-area-check-lax-v2.webp'),
 q('d10','driver','after','Remove trash, water and debris.','safety-chain-lax-v2.webp'),
 q('d11','driver','after','Turn the key to OFF and remove it.','off-key-removed-lax-v2.webp')
 ];
 for(const item of departure)data.push({...item,type:'departure'});
 if(typeof module==='object')module.exports=data;else root.HAS_PBB_ITEMS=data;
})(typeof window==='object'?window:globalThis);
