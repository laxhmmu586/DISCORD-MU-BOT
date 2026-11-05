'use strict';
function register(app,correct){
 app.post('/cbs-flights/:rowNumber',async(req,res)=>{
  try{res.json(await correct(req.params.rowNumber,req.body||{}));}
  catch(error){res.status(error.status||500).json({error:error.message||'Flight could not be saved.'});}
 });
}
module.exports={register};
