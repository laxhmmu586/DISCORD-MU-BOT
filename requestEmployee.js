// Older requests lack account snapshots; use their employee's current account as fallback.
module.exports=(record,employees)=>{
 const current=employees.get().employees.find(e=>e.id===record.employee.id);
 return {...record.employee,station:record.employee.station??current?.station,account:record.employee.account??current?.account};
};
