(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./employee-positions'));else root.employeeAccountGroups=factory(root.employeePositions);
})(typeof globalThis==='object'?globalThis:this,function(positions){
 const normalize=value=>String(value||'').trim().toUpperCase();
 const headquarters=new Set(positions.groups.find(group=>group.label==='Headquarters').positions);
 const isHeadquarter=row=>headquarters.has(positions.normalize(row.position))||['HQ','HEADQUARTER','HEADQUARTERS'].includes(normalize(row.station))||['HQ','HEADQUARTER','HEADQUARTERS'].includes(normalize(row.account));
 const scope=row=>({station:normalize(row.station||'LAX'),account:normalize(row.account||'MU')});
 const same=(a,b)=>normalize(a.station)===normalize(b.station)&&normalize(a.account)===normalize(b.account);
 const key=row=>JSON.stringify([scope(row).station,scope(row).account]);
 const memberships=row=>[...(isHeadquarter(row)?[]:[scope(row)]),...(Array.isArray(row.additionalAccounts)?row.additionalAccounts:[]).map(scope)];
 const belongs=(row,target)=>memberships(row).some(s=>same(s,target));
 const regions=['West Coast','Central U.S','East Coast'];
 const region=station=>({LAX:0,SFO:0,SJC:0,SAN:0,ONT:0,SMF:0,SEA:0,PDX:0,PHX:0,LAS:0,HNL:0,ANC:0,DEN:1,DFW:1,IAH:1,ORD:1,MSP:1,DTW:1,AUS:1,SAT:1,MCI:1,STL:1,BNA:1,JFK:2,EWR:2,BOS:2,IAD:2,DCA:2,PHL:2,ATL:2,MIA:2,MCO:2,FLL:2,CLT:2}[normalize(station)]);
 const regionName=station=>regions[region(station)]||'Other stations';
 return {normalize,isHeadquarter,scope,same,key,memberships,belongs,regions,regionName};
});
