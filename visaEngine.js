const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const {validDate}=require('./visaStore');
const {countryCodes}=require('./visaDestinations');
function visaIssuer(line){
  const text=line.replace(/\bBY\b.*$/,'');
  const following=text.match(/\b(?:VISA\d*|VS|V)\s*([A-Z]{3})(?=\b|20\d{2}|EXP)/)?.[1];
  if(countryCodes.has(following))return following;
  const preceding=text.match(/^CKIN\s+([A-Z]{3})\s+(?:VISA|VS|V)\b/)?.[1];
  if(countryCodes.has(preceding))return preceding;
  const countries=[...new Set([...text.matchAll(/\b([A-Z]{3})(?=\b|20\d{2})/g)].map(m=>m[1]).filter(c=>countryCodes.has(c)))];
  return countries.length===1?countries[0]:null;
}
function dateFromToken(value) {
  const s=value.trim().toUpperCase();let y,m,d;
  const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const named=s.match(/^(\d{1,2})\s*([A-Z]{3})\s*(\d{2}|\d{4})$/);
  if(iso){[,y,m,d]=iso;}else if(named){d=named[1];m=MONTHS.indexOf(named[2])+1;y=named[3].length===2?2000+Number(named[3]):named[3];if(!m)return null;}else return null;
  const result=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  try{return validDate(result)?result:null;}catch{return null;}
}
function ckinFacts(lines=[]) {
  const normalized=lines.map(s=>String(s).trim().toUpperCase().replace(/\s+/g,' ').replace(/^(?:CKIN[\s/]+)+/,'CKIN '));
  const facts={manual240:false,nbrd:false,documents:[],visaEvidence:[],visaFreeClaim:false,otherEntryClaim:false};
  for(const line of normalized){
    if(/^CKIN NBRD\b/.test(line)){facts.nbrd=true;continue;}
    // Whole remark, not a date, identifier or a request to apply for TWOV.
    if(/^CKIN\b/.test(line)&&/\b240\b/.test(line)&&!(/\b(?:NO|NEED|NOT|APPLY|PENDING|CANCELLED|INVALID)\b/.test(line))){facts.manual240=true;continue;}
    const doc=line.match(/\b(?:PR\s*CARD|PINK\s*CARD|TBZ|TRAVEL\s*DOC(?:UMENT)?)(?=\b|20\d{2})/);
    if(doc){const expiry=expiryFacts(line);facts.documents.push({type:/TRAVEL/.test(doc[0])?'TRAVELDOC':doc[0].replace(/\s/g,''),issuer:visaIssuer(line),...expiry,negative:/\b(?:NO|NOT|EXPIRED|APPLY|PENDING|CANCELLED|INVALID)\b/.test(line)});continue;}
    if(/\b(?:TWOV|TRANSIT|APEC)\b/.test(line))facts.otherEntryClaim=true;
    if(!/\b(?:VISA\d*|VS|V|TRAVEL\s*DOC(?:UMENT)?)\b/.test(line))continue;
    if(/\bFREE\b/.test(line)){facts.visaFreeClaim=true;continue;}
    const negative=/\b(?:NO|NEED|NOT|EXPIRED|APPLY|PENDING|CANCELLED|INVALID)\b/.test(line);
    const dateTokens=[...line.matchAll(/\d{4}-\d{2}-\d{2}|\d{1,2}\s*[A-Z]{3}\s*(?:\d{4}|\d{2})\b/g)];
    const dates=dateTokens.map(m=>dateFromToken(m[0])).filter(Boolean);
    const years=dateTokens.length?[]:[...line.matchAll(/(?:\b(?:EXP(?:IRY)?|TILL?|DT|VISA|VS|V|CHN)\s*[:#-]?\s*)(20\d{2})\b/g)].map(m=>Number(m[1]));
    facts.visaEvidence.push({issuer:visaIssuer(line),expiry:dateTokens.length===1&&dates.length===1?dates[0]:null,expiryYear:years.length===1?years[0]:null,negative,dateAmbiguous:dateTokens.length!==1||dates.length!==1});
  }
  return facts;
}
function expiryFacts(line) {
  const tokens=[...line.matchAll(/\d{4}-\d{2}-\d{2}|\d{1,2}\s*[A-Z]{3}\s*(?:\d{4}|\d{2})\b/g)];
  const dates=tokens.map(m=>dateFromToken(m[0])).filter(Boolean);
  const years=tokens.length?[]:[...line.matchAll(/\b(?:EXP(?:IRY)?|TILL?|DT|TBZ|PR\s*CARD|TRAVEL\s*DOC(?:UMENT)?)\s*[:#-]?\s*(20\d{2})\b/g)].map(m=>Number(m[1]));
  return {expiry:tokens.length===1&&dates.length===1?dates[0]:null,expiryYear:years.length===1?years[0]:null};
}
function decision(status,code,reason,extras={}){return {status,reason,reasonCodes:[code],missingFields:[],rules:[],sources:[],requirement:'unknown',inspection:'ambiguous',possibleMissedCheck:false,action:status==='pass'?'pass':'double_check',engineVersion:'visa-2',...extras};}
function evaluateVisa(input,store,{now=new Date()}={}){
  const facts=ckinFacts(input.ckinLines);
  if(facts.nbrd)return decision('review','NBRD','CKIN/NBRD: unresolved boarding remark');
  if(facts.manual240)return decision('pass','MANUAL_240','240 TWOV 已人工核对 — VISA PASS',{requirement:'manual_twov',inspection:'manual_confirmed',manualOverride:{type:'240_TWOV',verification:'agent_confirmed'}});
  if(input.nationality&&input.nationality!=='UNK'&&input.nationality===input.destinationCountry)return decision('pass','CITIZEN_RETURN','Passport holder returning to country of nationality — no visa needed',{requirement:'citizen',inspection:'not_needed'});
  const departureDate=dateFromToken(input.travelDate||'')||input.travelDate;
  const travelDate=input.entryDate||input.entryDateEarliest||departureDate;
  const latestEntryDate=input.entryDate||input.entryDateLatest||travelDate;
  if(input.entryDateConflict||!validDate(departureDate)||!validDate(travelDate)||!validDate(latestEntryDate)||latestEntryDate<travelDate||input.entryDate&&input.entryDate<departureDate)return decision('review','MISSING_TRAVEL_DATE','Travel or destination entry date is missing or inconsistent',{missingFields:['destinationEntryDate']});
  const asOf=now.toISOString().slice(0,10);let missing=[];let limitations=[];let requirement='unknown';let policyDetails={};
  const rules=store?.activeRules(input.nationality,input.destinationCountry,travelDate)||[];
  // The built-in announcement feeds monitor China entry policy. Other approved
  // destinations still require fresh exact policy pages and their review deadline.
  const pendingNotice=input.destinationCountry==='CHN'&&store?.db.prepare("SELECT 1 FROM visa_notices WHERE status='pending' LIMIT 1").get();
  const staleFeed=input.destinationCountry==='CHN'&&store?.db.prepare("SELECT last_success_at FROM visa_monitors WHERE kind='feed'").all().some(m=>!m.last_success_at||now-Date.parse(m.last_success_at)>72*3600000);
  for(const r of rules){
    if(travelDate<r.effective_from||(r.effective_until&&latestEntryDate>r.effective_until)){limitations.push('policy not effective for the destination entry date');if(latestEntryDate!==travelDate)missing.push('destinationEntryDate');continue;}
    if(r.recheck_due_at<asOf||!r.sources.length||r.sources.some(s=>s.review_status!=='approved'||s.latest_source_id!==s.id||!s.last_success_at||now-Date.parse(s.last_success_at)>72*3600000)){limitations.push('policy requires current verification');continue;}
    policyDetails={rules:[{id:r.id,version:r.version,effectiveUntil:r.effective_until}],sources:r.sources.map(s=>({id:s.id,url:s.url,authority:s.authority,verifiedAt:s.last_success_at}))};
    if(input.passportType!==r.passport_type){missing.push('ordinaryPassportConfirmation');continue;}
    if(r.rule_type==='citizen_return')continue;
    if(r.rule_type==='visa_document'){requirement='required';continue;}
    if(['special_document','residence_document'].includes(r.rule_type)) {
      requirement=r.rule_type==='residence_document'?'residence_document':'special_document';
      const c=r.conditions;
      const checked=facts.documents.find(d=>!d.negative&&d.type===c.documentType&&(d.issuer===c.issuer||(d.type==='TBZ'&&!d.issuer&&c.issuer==='CHN'))&&(d.expiry?d.expiry>=latestEntryDate:d.expiryYear>Number(latestEntryDate.slice(0,4))));
      if(checked&&!pendingNotice&&!staleFeed)return decision('pass','SPECIAL_DOCUMENT_CHECKED',`${c.documentType} check recorded for ${input.destinationCountry} — VISA PASS`,{...policyDetails,requirement,inspection:'recorded'});
      missing.push(c.documentType+'ValidityAndApplicability');continue;
    }
    requirement='conditional_exemption';
    if(pendingNotice||staleFeed){limitations.push(pendingNotice?'New official notice awaiting review':'Official announcement monitoring needs refresh');continue;}
    const c=r.conditions;
    const absent=[];
    if(!Number.isInteger(input.stayDays))absent.push('stayDays');
    if(!input.purpose)absent.push('purpose');
    if(c.cumulativeDays!==undefined){
      if(!Number.isInteger(input.previousStayDays))absent.push('previousStayDays');
      if(input.previousStayWindowDays!==c.cumulativeWindowDays)absent.push('previousStayWindowDays');
    }
    if(absent.length){missing.push(...absent);continue;}
    if(input.stayDays<0||input.stayDays>c.maxStayDays){limitations.push('stay exceeds visa exemption');continue;}
    if(!c.purposes.includes(input.purpose)){limitations.push('purpose outside visa exemption');continue;}
    if(c.cumulativeDays!==undefined){
      if(input.previousStayDays<0||input.previousStayDays+input.stayDays>c.cumulativeDays){limitations.push('cumulative stay exceeds exemption');continue;}
    }
    return decision('pass','GOVERNMENT_EXEMPTION',`${input.nationality} → ${input.destinationCountry}: no visa needed, exemption conditions checked (${c.maxStayDays} days)`,{...policyDetails,requirement:'exempt',inspection:'not_needed'});
  }
  if(facts.visaEvidence.length&&!(input.nationality==='TWN'&&input.destinationCountry==='CHN')) {
    // In the current China-bound workflow, unqualified VISA notes refer to China.
    // Do not infer an issuer for other destinations or combine separate remarks.
    const usable=facts.visaEvidence.filter(d=>!d.negative&&(d.issuer===input.destinationCountry||(!d.issuer&&input.destinationCountry==='CHN'&&input.allowImplicitChinaVisa!==false))&&(d.expiry||d.expiryYear));
    if(usable.length){
      const valid=usable.find(d=>d.expiry?d.expiry>=latestEntryDate:d.expiryYear>Number(latestEntryDate.slice(0,4)));
      if(valid)return decision('pass','CKIN_VISA_CHECKED',`${input.nationality} → ${input.destinationCountry}: agent visa check recorded; ${valid.expiry?'expiry '+valid.expiry:'expiry year '+valid.expiryYear} — VISA PASS`,{...policyDetails,requirement,inspection:'recorded'});
      const uncertainArrival=latestEntryDate!==travelDate&&usable.some(d=>d.expiry&&d.expiry>=travelDate);
      return decision('review','VISA_EXPIRY_REVIEW','Recorded visa does not establish validity through destination entry — DOUBLE CHECK',{...policyDetails,requirement,inspection:'ambiguous',missingFields:['validVisaExpiry',...(uncertainArrival?['destinationEntryDate']:[])]});
    }
    missing.push('visaIssuerAndUnambiguousExpiry');
  }
  if(facts.documents.length)missing.push('residenceOrSpecialDocumentApplicability');
  const hasEvidence=facts.visaEvidence.length||facts.documents.length||facts.visaFreeClaim||facts.otherEntryClaim;
  const missed=['required','special_document','residence_document'].includes(requirement)&&!hasEvidence;
  const reason=missed?`${requirement==='special_document'?'Entry travel document required':'Visa or verified exception required'}; no applicable check recorded in CKIN — possible missed check; DOUBLE CHECK`:requirement==='conditional_exemption'?`Visa exemption may apply; ${limitations.length?limitations.join('; '):'confirm missing exemption conditions'} — DOUBLE CHECK`:limitations.length?limitations.join('; ')+' — DOUBLE CHECK':hasEvidence?'CKIN entry basis is unclear or does not match destination — DOUBLE CHECK':'Entry requirement is unverified; no visa check recorded in CKIN — DOUBLE CHECK';
  return decision('review',missed?'POSSIBLE_MISSED_VISA_CHECK':'RULE_REVIEW',reason,{...policyDetails,requirement,inspection:hasEvidence?'ambiguous':'missing',possibleMissedCheck:missed,missingFields:[...new Set(missing)]});
}
module.exports={dateFromToken,ckinFacts,evaluateVisa};
