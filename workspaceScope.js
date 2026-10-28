const groups=require('./public/public/employee-account-groups');
function scopeEmployee(employee,value){
 if(!employee||!value)return employee;
 let scope;try{scope=typeof value==='string'?JSON.parse(value):value;}catch{throw Object.assign(Error('Invalid workspace account.'),{status:400});}
 if(!scope||typeof scope.station!=='string'||typeof scope.account!=='string')throw Object.assign(Error('Invalid workspace account.'),{status:400});
 if(!groups.belongs(employee,scope))throw Object.assign(Error('This account is not assigned to you.'),{status:403});
 return {...employee,...groups.scope(scope)};
}
module.exports={scopeEmployee};
