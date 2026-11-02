'use strict';
function register(app,correct){
 app.post('/cbs-bag-tags/:rowNumber',async(req,res)=>{
  try{const result=await correct(req.params.rowNumber,req.body||{});res.json(result);}
  catch(error){res.status(error.status||500).json({error:error.message||'Bag tag could not be saved.'});}
 });
}
module.exports={register};
