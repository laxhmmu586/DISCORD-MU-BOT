const groups = require('./has/public/employee-account-groups');
const {isTestRosterAccount} = require('./has/server/employeeRosterVisibility');

// Read the same employee database and stable assignment IDs as the website Schedule.
function createArrivalTeamReader({employees,log=console}) {
  return async function read(date) {
    const row=employees.db.prepare('SELECT data FROM staff_schedule_days WHERE date=?').get(date);
    if(!row)throw Error('ETAB website schedule date not found: '+date);
    const assignments=JSON.parse(row.data).assignments || {};
    const roster=employees.get().employees.filter(e=>e.name && groups.belongs(e,{station:'LAX',account:'MU'}) &&
      (isTestRosterAccount(e) || ![e.name,e.nickname].some(value=>['DEMOHAS','HASOPSRAMP'].includes(String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'')))));
    const ids=[],skipped=[],invalid=[];
    for(const employee of roster) {
      if(String(assignments[employee.id]?.code || '').trim().toUpperCase()!=='A')continue;
      const id=String(employee.discordId || '').trim();
      if(!id)skipped.push(employee.name);
      else if(!/^\d{17,20}$/.test(id))invalid.push(employee.name);
      else ids.push(id);
    }
    if(skipped.length)log.warn?.('ETAB arrival team skipped employees without Discord IDs:',skipped.join(', '));
    if(invalid.length)throw Error('ETAB schedule employees require valid server Discord IDs: '+invalid.join(', '));
    return [...new Set(ids)];
  };
}
module.exports={createArrivalTeamReader};
