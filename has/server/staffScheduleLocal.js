// Local schedule storage retains imported metadata but never connects to Sheets.
function createLocalSchedule({db,roles,colors}){
 db.exec('CREATE TABLE IF NOT EXISTS staff_schedule_sync_settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');
 const previous=JSON.parse(db.prepare('SELECT data FROM staff_schedule_sync_settings WHERE id=1').get()?.data||'{}');
 for(const [code,value] of Object.entries(previous.roleDefinitions||{}))if(/^[A-Z][A-Z0-9·/+ -]{0,7}$/.test(code)&&typeof value.label==='string'&&/^#[0-9a-f]{6}$/i.test(value.color)){const duty=code==='GS'?'G':code;roles[duty]=value.label;colors[duty]=value.color;}
 const persist=value=>db.prepare('INSERT OR REPLACE INTO staff_schedule_sync_settings VALUES(1,?)').run(JSON.stringify(value));
 persist({...previous,enabled:false,pendingEnd:null});
 const status=()=>{const saved=JSON.parse(db.prepare('SELECT data FROM staff_schedule_sync_settings WHERE id=1').get().data),latest=db.prepare('SELECT MAX(date) AS date FROM staff_schedule_days').get()?.date;return {enabled:false,state:'local',queued:0,conflicts:0,horizon:[saved.horizon,latest].filter(Boolean).sort().at(-1)||null};};
 return {run:fn=>Promise.resolve().then(fn),refresh:async()=>{},queue:()=>{},requestFlush:()=>{},close:()=>{},status,configure:async body=>{if(body.enabled||body.resolve)throw Object.assign(Error('Google Sheets synchronization has been removed. Edit schedules on this website.'),{status:410});return status();},extend:async horizon=>{const saved=JSON.parse(db.prepare('SELECT data FROM staff_schedule_sync_settings WHERE id=1').get().data);persist({...saved,horizon,enabled:false,pendingEnd:null});return status();}};
}
module.exports={createLocalSchedule};
