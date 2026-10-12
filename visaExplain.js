async function explainDecision(result,{fetcher=fetch,key=process.env.OPENAI_API_KEY,model=process.env.VISA_AI_MODEL}={}) {
  const fallback={status:result.status,explanation:result.reason,missingFields:result.missingFields||[],sources:result.sources||[],provider:'template'};
  if(!key||!model)return fallback;
  // No passenger identity, raw logs, notes or untrusted page instructions leave this service.
  const safe={status:result.status,reasonCodes:result.reasonCodes,reason:result.reason,missingFields:result.missingFields,rules:result.rules,sources:result.sources,manualOverride:result.manualOverride};
  try{
    const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,max_output_tokens:400,instructions:'用简洁中文解释给定的 VISA 规则结论。结论已由规则引擎确定，你不得改变它。只解释提供的事实和缺项，不补充政策，不猜日期，不自行判定入境资格。240 TWOV 表示 agent 已人工核对，无需再次核验。只返回解释文字。',input:JSON.stringify(safe)})});
    if(!response.ok)throw Error('AI unavailable');
    const body=await response.json();const text=(body.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
    if(!text||text.length>3000)throw Error('Invalid explanation');
    return {...fallback,explanation:text,provider:'openai',advisory:true};
  }catch{return fallback;}
}
module.exports={explainDecision};
