// Public presentation fields only; never expose employee contact or login details.
module.exports=(person={},employees)=>{
 const id=person.employeeId||person.id,current=employees.get().employees.find(row=>row.id===id);
 const db=employees.db,hasAvatars=db?.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='employee_avatars'").get();
 const nickname=current?.nickname||person.nickname,avatar=(hasAvatars&&db.prepare('SELECT data FROM employee_avatars WHERE employee_id=?').get(id)?.data)||person.avatar;
 return {...(nickname?{nickname}:{}),...(avatar?{avatar}:{})};
};
