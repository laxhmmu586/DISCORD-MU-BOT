const positions=require('./public/public/employee-positions');
const defaults=[
 {id:'call-off',title:'Call Off',body:'Company policy requires you to submit a call-off request at least 2 hours before your shift starts.',emphasis:''},
 {id:'clock-in',title:'Clock In on Time',body:'Failure to clock in on time will be considered tardy.',emphasis:''},
 {id:'no-show',title:'No Call, No Show',body:'First occurrence: a warning. Second occurrence: suspension.',emphasis:''},
 {id:'late-early',title:'Late Arrival / Early Departure',body:'Arriving late or leaving early without notifying your supervisor will be considered tardy.',emphasis:'* Unannounced late arrivals or early departures are unacceptable.'}
];
function canEdit(user,row){const rank=positions.groups[0].positions.indexOf(positions.normalize(row?.position));return require('./serverOwners').isOwner(user)||rank>=0&&rank<=positions.groups[0].positions.indexOf('Supervisor');}
function register(app,{db,profiles,now=()=>new Date()}){
 db.exec('CREATE TABLE IF NOT EXISTS staff_schedule_rules(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');
 const read=()=>{const saved=db.prepare('SELECT data FROM staff_schedule_rules WHERE id=1').get();return saved?JSON.parse(saved.data):{revision:0,rules:defaults};};
 const view=req=>({...read(),canEdit:canEdit(req.scheduleAccess.user,profiles.linked(req.scheduleAccess.user))});
 app.get('/staff-schedule-api/rules',(req,res)=>res.json(view(req)));
 const save=db.transaction(req=>{
  if(!canEdit(req.scheduleAccess.user,profiles.linked(req.scheduleAccess.user)))throw Object.assign(Error('Only Supervisor and above can edit schedule rules.'),{status:403});
  const current=read(),{rules,revision}=req.body;
  if(revision!==current.revision)throw Object.assign(Error('Rules changed. Reopen Rules before saving.'),{status:409});
  if(!Array.isArray(rules)||rules.length!==defaults.length||rules.some((rule,index)=>!rule||rule.id!==defaults[index].id||typeof rule.title!=='string'||!rule.title.trim()||rule.title.length>100||typeof rule.body!=='string'||!rule.body.trim()||rule.body.length>1600||typeof rule.emphasis!=='string'||rule.emphasis.length>400||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(rule.title+rule.body+rule.emphasis)))throw Object.assign(Error('Enter a title and rule for each section within the length limits.'),{status:400});
  const data={revision:current.revision+1,rules:rules.map(({id,title,body,emphasis})=>({id,title:title.trim(),body:body.trim(),emphasis:emphasis.trim()})),updatedAt:now().toISOString()};db.prepare('INSERT OR REPLACE INTO staff_schedule_rules VALUES(1,?)').run(JSON.stringify(data));return {...data,canEdit:true};
 });
 app.post('/staff-schedule-api/rules',(req,res)=>{try{res.json(save(req));}catch(error){res.status(error.status||400).json({error:error.message});}});
}
module.exports={defaults,canEdit,register};
