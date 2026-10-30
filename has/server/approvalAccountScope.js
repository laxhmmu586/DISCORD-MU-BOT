const accounts=require('../public/employee-account-groups');
const positions=require('../public/employee-positions');
function requesterScope(requester,employees){
 const current=employees?.get().employees.find(e=>e.id===requester?.id);
 return accounts.scope(current||requester||{});
}
function eligible(position,person,requester,employees){
 const manager=positions.same(person?.position,'Business Manager');
 if(!positions.same(position,'Business Manager')&&!manager)return true;
 return manager&&!accounts.isHeadquarter(person)&&accounts.same(accounts.scope(person),requesterScope(requester,employees));
}
module.exports={eligible,requesterScope};
