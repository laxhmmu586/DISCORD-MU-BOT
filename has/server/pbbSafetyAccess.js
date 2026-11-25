const accounts=require('../public/employee-account-groups');
const positions=require('../public/employee-positions');

function safetyStation(employee){
 if(!employee||employee.accountDisabled||employee.mergedInto||!employee.station||accounts.isHeadquarter(employee))return null;
 return positions.normalize(employee.position)==='Safety Advocate'?accounts.normalize(employee.station):null;
}

module.exports={safetyStation};
