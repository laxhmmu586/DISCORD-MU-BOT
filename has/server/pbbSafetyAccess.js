const accounts=require('../public/employee-account-groups');
const positions=require('../public/employee-positions');

function safetyStation(employee){
 if(!employee||employee.accountDisabled||employee.mergedInto||positions.normalize(employee.position)!=='Safety Advocate')return null;
 const station=accounts.normalize(employee.station);
 return station&&!accounts.isHeadquarter({station})?station:null;
}

module.exports={safetyStation};
