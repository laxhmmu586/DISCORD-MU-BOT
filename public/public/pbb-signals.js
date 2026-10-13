(function(root){
// A single explicit confirmation maps to the original PDF rows; it never confirms the other operator's work.
const data={
 arrival:{safe:{role:'spotter',items:['a11','a13'],label:'READY / SAFE',description:'Aircraft chocked, path clear; READY / SAFE hand signals sent.'},go:{role:'driver',items:['a12','a14'],after:'safe',label:'Confirm GO and ring the warning bell three times',description:'READY / SAFE received; GO confirmed and warning bell sounded three times.'}},
 departure:{ready:{role:'driver',items:['d5'],label:'READY',description:'READY hand signal sent to spotter.'},safe:{role:'spotter',items:['d6'],after:'ready',label:'SAFE',description:'Surroundings double-checked; SAFE hand signal sent.'},go:{role:'driver',items:['d7'],after:'safe',label:'Confirm GO and ring the warning bell three times',description:'GO confirmed and warning bell sounded three times.'}}
};

if(typeof module==='object')module.exports=data;else root.PBB_SIGNALS=data;
})(typeof window==='object'?window:globalThis);
