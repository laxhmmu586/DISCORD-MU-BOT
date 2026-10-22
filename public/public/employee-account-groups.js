(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./employee-positions'));else root.employeeAccountGroups=factory(root.employeePositions);
})(typeof globalThis==='object'?globalThis:this,function(positions){
 const normalize=value=>String(value||'').trim().toUpperCase();
 const headquarters=new Set(positions.groups.find(group=>group.label==='Headquarters').positions);
 const isHeadquarter=row=>headquarters.has(positions.normalize(row.position))||['HQ','HEADQUARTER','HEADQUARTERS'].includes(normalize(row.station))||['HQ','HEADQUARTER','HEADQUARTERS'].includes(normalize(row.account));
 const scope=row=>({station:normalize(row.station||'LAX'),account:normalize(row.account||'MU')});
 const same=(a,b)=>normalize(a.station)===normalize(b.station)&&normalize(a.account)===normalize(b.account);
 const key=row=>JSON.stringify([scope(row).station,scope(row).account]);
 return {normalize,isHeadquarter,scope,same,key};
});
