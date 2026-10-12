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
  // Known counter typo; use an explicit alias rather than guessing any month.
  const s=value.trim().toUpperCase().replace(/\bSEPO(?=\s*\d{2,4}\b)/g,'SEP');let y,m,d;
  const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const named=s.match(/^(\d{1,2})\s*([A-Z]{3})\s*(\d{2}|\d{4})$/);
  const numeric=s.match(/^(\d{1,2})[ /-](\d{1,2})[ /-](\d{4})$/);
  const spacedIso=s.match(/^(\d{4})\s+(\d{1,2})\s+(\d{1,2})$/);
  if(iso||spacedIso){[,y,m,d]=iso||spacedIso;}else if(numeric){[,d,m,y]=numeric;}else if(named){d=named[1];m=MONTHS.indexOf(named[2])+1;y=named[3].length===2?2000+Number(named[3]):named[3];if(!m)return null;}else return null;
  const result=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  try{return validDate(result)?result:null;}catch{return null;}
}
function ckinFacts(lines=[]) {
  const normalized=lines.map(s=>String(s).trim().toUpperCase().replace(/\s+/g,' ').replace(/^(?:CKIN[\s/]+)+/,'CKIN '));
  const facts={manual240:false,nbrd:false,documents:[],visaEvidence:[],visaFreeClaim:false,exemptionClaims:[],alternatePassports:[],tdac:false,otherEntryClaim:false};
  for(const line of normalized){
    if(/^CKIN NBRD\b/.test(line)){facts.nbrd=true;continue;}
    // Whole remark, not a date, identifier or a request to apply for TWOV.
    if(/^CKIN\b/.test(line)&&/\b240\b/.test(line)&&!(/\b(?:NO|NEED|NOT|APPLY|PENDING|CANCELLED|INVALID)\b/.test(line))){facts.manual240=true;continue;}
    const negative=/\b(?:NO|NEED|NOT|EXPIRED|APPLY|PENDING|CANCELLED|INVALID)\b/.test(line);
    if(/\bTDAC\b/.test(line)){facts.otherEntryClaim=true;if(!negative)facts.tdac=true;}
    const alternate=line.match(/\b(?:DUAL|DURAL)\s+CITIZENSHIP\b.*?\b([A-Z]{3})\s+(?:PPT|PASSPORT)\b/);
    if(alternate){facts.otherEntryClaim=true;facts.alternatePassports.push({nationality:alternate[1],...expiryFacts(line),negative});}
    const doc=line.match(/\b(?:RESIDENT\s*CARD|PR\s*CARD|PINK\s*CARD|APEC\s*CARD|TBZ|TRVL\s*(?:DCMNT|DOMENT|DOC(?:UMENT)?)|TRAVEL\s*DOC(?:UMENT)?)(?=\b|20\d{2})/);
    if(doc){const expiry=/\b(?:VISA\d*|VS|V)\b/.test(line)?{expiry:null,expiryYear:null}:expiryFacts(line);facts.documents.push({type:/TRAVEL|TRVL/.test(doc[0])?'TRAVELDOC':/RESIDENT/.test(doc[0])?'PRCARD':doc[0].replace(/\s/g,''),issuer:visaIssuer(line)||(/RESIDENT|PINK|TRVL/.test(doc[0])?'CHN':null),...expiry,negative});continue;}
    if(/\b(?:TWOV|TRANSIT|APEC)\b/.test(line))facts.otherEntryClaim=true;
    if(!/\b(?:VISA\d*|VS|V|TRAVEL\s*DOC(?:UMENT)?)\b/.test(line))continue;
    if(/\bFREE\b/.test(line)){facts.visaFreeClaim=true;const days=line.match(/\b(?:(?:VISA|VS|V)\s+FREE\s+(?:FOR\s+)?(\d{1,3})(?=\s*DAYS?\b|\b)|(?:(\d{1,3})\s*DAYS?\s+(?:VISA|VS|V)\s+FREE\b)|(?:(?:VISA|VS|V)\s+(\d{1,3})\s*DAYS?\s+FREE\b))/);facts.exemptionClaims.push({days:days?Number(days[1]||days[2]||days[3]):null,negative,nationality:alternate?.[1]||line.match(/^CKIN\s+([A-Z]{3})\s+(?:PPT|PASSPORT)\b/)?.[1]||null});continue;}
    const dateTokens=expiryTokens(line);
    const dates=dateTokens.map(m=>dateFromToken(m[0])).filter(Boolean);
    const years=dateTokens.length?[]:[...line.matchAll(/(?:\b(?:EXP(?:IRY)?|TILL?|DT|VISA|VS|V|CHN)\s*[:#-]?\s*)(20\d{2})\b/g)].map(m=>Number(m[1]));
    facts.visaEvidence.push({issuer:visaIssuer(line),expiry:dateTokens.length===1&&dates.length===1?dates[0]:null,expiryYear:years.length===1?years[0]:null,negative,dateAmbiguous:dateTokens.length!==1||dates.length!==1});
  }
  return facts;
}
function expiryFacts(line) {
  const tokens=expiryTokens(line);
  const dates=tokens.map(m=>dateFromToken(m[0])).filter(Boolean);
  const years=tokens.length?[]:[...line.matchAll(/\b(?:EXP(?:IRY)?|TILL?|DT|TBZ|RESIDENT\s*CARD|PR\s*CARD|TRAVEL\s*DOC(?:UMENT)?)\s*[:#-]?\s*(20\d{2})\b/g)].map(m=>Number(m[1]));
  return {expiry:tokens.length===1&&dates.length===1?dates[0]:null,expiryYear:years.length===1?years[0]:null};
}
function expiryTokens(line){return [...line.matchAll(/\d{4}-\d{2}-\d{2}|\d{4}\s+\d{1,2}\s+\d{1,2}\b|\d{1,2}[ /-]\d{1,2}[ /-]\d{4}\b|\d{1,2}\s*(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP(?:O)?|OCT|NOV|DEC)\s*(?:\d{4}|\d{2})\b/g)];}
function decision(status,code,reason,extras={}){return {status,reason,reasonCodes:[code],missingFields:[],rules:[],sources:[],requirement:'unknown',inspection:'ambiguous',possibleMissedCheck:false,action:status==='pass'?'pass':'double_check',engineVersion:'visa-4',...extras};}
function evaluateVisa(input,store,{now=new Date()}={}){
  const facts=ckinFacts(input.ckinLines);
  if(facts.nbrd)return decision('review','NBRD','CKIN/NBRD: unresolved boarding remark');
  if(facts.manual240)return decision('pass','MANUAL_240','240 TWOV 已人工核对 — VISA PASS',{requirement:'manual_twov',inspection:'manual_confirmed',manualOverride:{type:'240_TWOV',verification:'agent_confirmed'}});
  if(input.nationality&&input.nationality!=='UNK'&&input.nationality===input.destinationCountry)return decision('pass','CITIZEN_RETURN','Passport holder returning to country of nationality — no visa needed',{requirement:'citizen',inspection:'not_needed'});
  const departureDate=dateFromToken(input.travelDate||'')||input.travelDate;
  const travelDate=input.entryDate||input.entryDateEarliest||departureDate;
  const latestEntryDate=input.entryDate||input.entryDateLatest||travelDate;
  if(input.entryDateConflict||!validDate(departureDate)||!validDate(travelDate)||!validDate(latestEntryDate)||latestEntryDate<travelDate||input.entryDate&&input.entryDate<departureDate)return decision('review','MISSING_TRAVEL_DATE','Travel or destination entry date is missing or inconsistent',{missingFields:['destinationEntryDate']});
  if(input.destinationCountry==='THA'&&!facts.tdac)return decision('review','TDAC_MISSING','泰国入境：未记录有效 TDAC 核对；TDAC 是电子入境卡，签证或免签不能替代 — DOUBLE CHECK',{missingFields:['TDACConfirmation']});
  const asOf=now.toISOString().slice(0,10);let missing=[];let limitations=[];let requirement='unknown';let policyDetails={};
  const validThrough=d=>!d.negative&&(d.expiry?d.expiry>=latestEntryDate:d.expiryYear>Number(latestEntryDate.slice(0,4)));
  // China-bound CKIN documents are the agent's completed applicability check,
  // just like a recorded visa. Retain expiry and explicit destination conflicts.
  const recordedDocument=input.destinationCountry==='CHN'&&facts.documents.find(d=>validThrough(d)&&(!d.issuer||d.issuer==='CHN'));
  if(recordedDocument){
    const labels={TBZ:'台胞证',PRCARD:'永久居留证',PINKCARD:'回乡证',APECCARD:'APEC 商务旅行卡',TRAVELDOC:'旅行证'};
    return decision('pass','CKIN_DOCUMENT_CHECKED',`${labels[recordedDocument.type]}已由 agent 核对；${recordedDocument.expiry?'有效期 '+recordedDocument.expiry:'有效期年份 '+recordedDocument.expiryYear} — VISA PASS`,{
      requirement:recordedDocument.type==='PRCARD'?'residence_document':'special_document',inspection:'recorded',
      manualOverride:{type:recordedDocument.type,verification:'agent_confirmed'}});
  }
  const alternate=facts.alternatePassports.length===1&&validThrough(facts.alternatePassports[0])&&countryCodes.has(facts.alternatePassports[0].nationality)?facts.alternatePassports[0]:null;
  const policyNationality=alternate?.nationality||input.nationality;
  const rules=store?.activeRules(policyNationality,input.destinationCountry,travelDate)||[];
  // The built-in announcement feeds monitor China entry policy. Other approved
  // destinations still require fresh exact policy pages and their review deadline.
  const pendingNotice=input.destinationCountry==='CHN'&&store?.db.prepare("SELECT 1 FROM visa_notices WHERE status='pending' LIMIT 1").get();
  const staleFeed=input.destinationCountry==='CHN'&&store?.db.prepare("SELECT last_success_at FROM visa_monitors WHERE kind='feed'").all().some(m=>!m.last_success_at||now-Date.parse(m.last_success_at)>72*3600000);
  for(const r of rules){
    if(r.id.startsWith('chn-entry-')&&!facts.documents.some(d=>d.type===r.conditions.documentType))continue;
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
      missing.push('validDocumentExpiry');continue;
    }
    requirement='conditional_exemption';
    if(pendingNotice||staleFeed){limitations.push(pendingNotice?'New official notice awaiting review':'Official announcement monitoring needs refresh');continue;}
    const c=r.conditions;
    // BN audits the entry basis and the agent's record. Stay/purpose limits are
    // retained in policy data, but are not passenger facts required by this audit.
    const claim=facts.exemptionClaims.find(x=>!x.negative&&x.days===c.maxStayDays&&(!x.nationality||x.nationality===policyNationality));
    if(facts.exemptionClaims.length){
      if(!claim||!facts.exemptionClaims.every(x=>!x.negative&&x.days===claim.days&&(!x.nationality||x.nationality===policyNationality))){limitations.push('CKIN exemption claim conflicts with passport or current policy');continue;}
      return decision('pass','CKIN_EXEMPTION_CHECKED',`${policyNationality} → ${input.destinationCountry}: agent recorded VISA FREE ${claim.days} DAYS; current policy matches — VISA PASS`,{...policyDetails,requirement:'exempt',inspection:'recorded',policyNationality});
    }
    return decision('pass','GOVERNMENT_EXEMPTION',`${policyNationality} → ${input.destinationCountry}: current ordinary-passport exemption (${c.maxStayDays}-day policy) — VISA PASS`,{...policyDetails,requirement:'exempt',inspection:'not_needed',policyNationality});
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
  if(facts.documents.some(d=>!validThrough(d)))missing.push('validDocumentExpiry');
  if(facts.documents.some(d=>d.issuer&&d.issuer!==input.destinationCountry))missing.push('documentDestinationConflict');
  if(facts.alternatePassports.length&&!alternate)missing.push('alternatePassportValidity');
  const labels={TBZ:'台胞证',PRCARD:'绿卡',PINKCARD:'港澳居民来往内地通行证（PINK CARD）',APECCARD:'APEC 商务旅行卡',TRAVELDOC:'旅行证'};
  const recorded=facts.documents.map(d=>`${labels[d.type]}${d.expiry?'，有效期 '+d.expiry:d.expiryYear?'，有效期年份 '+d.expiryYear:'，有效期未明确'}`).concat(facts.tdac?['TDAC 已记录（泰国电子入境卡）']:[],facts.alternatePassports.map(d=>`双重国籍 ${d.nationality} 护照${d.expiry?'，有效期 '+d.expiry:d.expiryYear?'，有效期年份 '+d.expiryYear:'，有效期未明确'}`));
  const hasEvidence=facts.visaEvidence.length||facts.documents.length||facts.visaFreeClaim||facts.otherEntryClaim;
  const missed=['required','special_document','residence_document'].includes(requirement)&&!hasEvidence;
  const reason=missed?`${requirement==='special_document'?'Entry travel document required':'Visa or verified exception required'}; no applicable check recorded in CKIN — possible missed check; DOUBLE CHECK`:requirement==='conditional_exemption'?`Visa exemption may apply; ${limitations.length?limitations.join('; '):'confirm missing exemption conditions'} — DOUBLE CHECK`:limitations.length?limitations.join('; ')+' — DOUBLE CHECK':hasEvidence?'CKIN entry basis is unclear or does not match destination — DOUBLE CHECK':'Entry requirement is unverified; no visa check recorded in CKIN — DOUBLE CHECK';
  return decision('review',missed?'POSSIBLE_MISSED_VISA_CHECK':'RULE_REVIEW',(recorded.length?recorded.join('; ')+'；':'')+reason,{...policyDetails,requirement,inspection:hasEvidence?'ambiguous':'missing',possibleMissedCheck:missed,missingFields:[...new Set(missing)],policyNationality});
}
module.exports={dateFromToken,ckinFacts,evaluateVisa};
