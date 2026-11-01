const positions=require('../public/employee-positions');
const groups=require('../public/employee-account-groups');
const stationManagers=new Set(['Regional Manager','General Manager','Interim General Manager','Airport Manager','Airport Operations Manager']);
function accessFor(user,employee){
 if(require('./employees').ADMIN_EMAILS.has(String(user?.email||'').toLowerCase()))return {level:'company'};
 if(!employee||employee.mergedInto)return null;
 const title=positions.normalize(employee.position);
 if(stationManagers.has(title)&&!groups.isHeadquarter(employee))return {level:'station',station:groups.scope(employee).station};
 if(title==='Business Manager'&&!groups.isHeadquarter(employee))return {level:'account',...groups.scope(employee)};
 return null;
}
function canManage(access,scope){return !!access&&(access.level==='company'||access.level==='station'&&scope.type!=='company'&&scope.station===access.station||access.level==='account'&&scope.type==='account'&&scope.station===access.station&&scope.account===access.account);}
function matches(employee,scope){if(!employee||employee.mergedInto)return false;return scope.type==='company'||[groups.scope(employee),...groups.memberships(employee)].some(s=>s.station===scope.station&&(scope.type==='station'||s.account===scope.account));}
module.exports={accessFor,canManage,matches};
