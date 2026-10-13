// The repository is public. Full employee records must come from private deployment configuration.
const fs=require('node:fs'),path=require('node:path');
module.exports=function loadEmployeeSeed(){
 let raw=process.env.PBB_EMPLOYEE_SEED_JSON;
 if(!raw){const filename=process.env.PBB_EMPLOYEE_SEED_PATH||path.join(__dirname,'data/employee-seed.json');try{raw=fs.readFileSync(filename,'utf8');}catch(e){if(e.code==='ENOENT')return [];throw e;}}
 const parsed=JSON.parse(raw),rows=Array.isArray(parsed)?parsed:parsed.employees;
 if(!Array.isArray(rows)||rows.length>500)throw Error('PBB employee seed must contain an employee array');
 return rows;
};
