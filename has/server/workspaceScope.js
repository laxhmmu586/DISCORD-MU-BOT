const groups=require('../public/employee-account-groups');
function scopeEmployee(employee,value){
 if(!employee||!value)return employee;
 let scope;try{scope=typeof value==='string'?JSON.parse(value):value;}catch{throw Object.assign(Error('Invalid workspace account.'),{status:400});}
 if(!scope||typeof scope.station!=='string'||typeof scope.account!=='string')throw Object.assign(Error('Invalid workspace account.'),{status:400});
 if(!employee.isServerOwner&&!require('./serverOwners').isOwner(employee.loginId)&&!groups.belongs(employee,scope))throw Object.assign(Error('This account is not assigned to you.'),{status:403});
 return {...employee,...groups.scope(scope)};
}
// These shared MU tools accept MU in any assigned account slot.
function scopeOperationsEmployee(employee,value){
 const selected=scopeEmployee(employee,value);
 return employee&&(employee.isServerOwner||require('./serverOwners').isOwner(employee.loginId)||groups.belongs(employee,{station:'LAX',account:'MU'}))?{...employee,station:'LAX',account:'MU'}:selected;
}
module.exports={scopeEmployee,scopeOperationsEmployee};
