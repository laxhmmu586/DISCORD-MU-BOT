const crypto=require('node:crypto');
const {evaluateVisa}=require('./visaEngine');
const {explainDecision}=require('./visaExplain');
const {seedCandidates}=require('./visaSeed');
const {createReviewerVerifier}=require('./visaReviewerAuth');
const {officialUrl}=require('./visaSources');
const {fetchOfficial,policyText}=require('./visaMonitor');
function mountVisaRoutes(app,store,monitor,{token=require('./visaAdminToken').adminToken(),verifyReviewer=createReviewerVerifier(),fetcher=fetch}={}) {
  const auth=async(req,res,next)=>{
    const supplied=req.headers.authorization?.replace(/^Bearer /,'')||'';
    const a=Buffer.from(supplied),b=Buffer.from(token);
    if(token&&a.length===b.length&&crypto.timingSafeEqual(a,b)){req.visaReviewer={reviewer:'Visa administrator'};return next();}
    try{req.visaReviewer=await verifyReviewer(supplied);return next();}catch(e){return res.status(403).json({error:e.message});}
  };
  app.use('/visa-api',auth);
  app.get('/visa-api/reviewer',(req,res)=>res.json({canReview:true,reviewer:req.visaReviewer.reviewer}));
  app.get('/visa-api/status',(_,res)=>res.json(store.overview()));
  app.get('/visa-api/sources/:id',(req,res)=>{
    const s=store.db.prepare('SELECT * FROM visa_sources WHERE id=?').get(req.params.id);
    if(!s)return res.status(404).json({error:'Snapshot not found'});res.json(s);
  });
  const handle=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(e){res.status(400).json({error:e.message});}};
  app.post('/visa-api/check',handle(async()=>({results:await monitor.check(),candidates:seedCandidates(store)})));
  app.post('/visa-api/rules',handle(req=>store.draft(req.body.rule,req.body.sourceIds)));
  app.post('/visa-api/rules/:id/:version/approve',handle(req=>{store.approve(req.params.id,Number(req.params.version),req.visaReviewer.reviewer);return {approved:true};}));
  app.post('/visa-api/notices/review',handle(req=>{store.acknowledgeNotice(req.body.url,req.visaReviewer.reviewer,new Date().toISOString());return {reviewed:true};}));
  app.post('/visa-api/source-preview',handle(async req=>{
    const url=req.body?.url;
    if(typeof url!=='string'||url.length>1500||!officialUrl(url))throw Error('Please use a supported official government HTTPS source');
    const content=policyText(await fetchOfficial(url,fetcher));
    if(content.length<80||!/visa|免签|签证|入境|过境|travel|通行证/i.test(content))throw Error('Official entry policy content missing');
    const authority=new URL(url).hostname;
    if(store.db.prepare('SELECT kind FROM visa_monitors WHERE url=?').get(url)?.kind==='feed')throw Error('Use the policy article, not an announcement index');
    store.db.prepare("INSERT OR IGNORE INTO visa_monitors(url,kind,authority) VALUES(?,'policy',?)").run(url,authority);
    const mon=store.db.prepare('SELECT * FROM visa_monitors WHERE url=?').get(url);
    const snap=store.snapshot(mon,content,new Date().toISOString());
    return {id:snap.id,url,authority,content};
  }));
  app.post('/visa-api/review-combination',handle(req=>{
    const {rule,sourceIds,confirmed}=req.body||{};
    if(confirmed!==true)throw Error('Confirm the verified policy conditions before publishing');
    if(!rule||typeof rule.clause_reference!=='string'||rule.clause_reference.trim().length<10||rule.clause_reference.length>500)throw Error('Record the verified policy clause or conditions');
    if(!['visa_exempt','visa_document','special_document','residence_document'].includes(rule.rule_type))throw Error('Unsupported entry basis');
    const canonicalId=`reviewed-${rule.destination_country}-${rule.nationality}-${rule.passport_type}`.toLowerCase();
    // Draft and publish atomically: failure cannot partially replace an active policy.
    return store.db.transaction(()=>{
      const draft=store.draft({...rule,id:canonicalId},sourceIds);
      store.approve(draft.id,draft.version,req.visaReviewer.reviewer);
      return {...draft,approved:true,reviewer:req.visaReviewer.reviewer};
    })();
  }));
  app.post('/visa-api/evaluate',handle(async req=>{
    const b=req.body;
    if(!b||!Array.isArray(b.ckinLines)||b.ckinLines.length>30||b.ckinLines.some(s=>typeof s!=='string'||s.length>500)||!/^[A-Z]{3}$/.test(b.nationality||'')||!/^[A-Z]{3}$/.test(b.destinationCountry||''))throw Error('Invalid visa facts');
    const result=evaluateVisa(b,store);
    // Save only the digest and rule outcome, never passport numbers or raw CKIN.
    store.db.prepare(`INSERT INTO visa_decisions VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),new Date().toISOString(),b.travelDate||'',result.engineVersion,
      crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex'),JSON.stringify(result.rules),result.status,JSON.stringify(result.reasonCodes),JSON.stringify(result.missingFields),JSON.stringify(result.sources.map(s=>s.id)),result.manualOverride?JSON.stringify(result.manualOverride):null);
    return {...result,...await explainDecision(result)};
  }));
}
module.exports={mountVisaRoutes};
