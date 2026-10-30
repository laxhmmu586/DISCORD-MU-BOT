const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {DEFAULTS}=require('../briefing'),{reportSections,renderBriefingReport,buildBriefingPdf}=require('../briefingPdf'),{renderBriefingImageSvg,buildBriefingImage}=require('../briefingImage');
const base={id:'assignment-layout',date:'2026-10-30',flight:'MU583',direction:'arrival',generatedAt:'2026-10-30T18:00:00Z',generatedBy:'Fixture'};
test('Arrival hides only unassigned roles across PDF sections, report preview and photo',async()=>{
 const snapshot={...base,fields:{...DEFAULTS,arrivalLead:'Yogesh',announcement:'Terry',carousel:'Hana',phoneCall:'Yogesh',jetBridge:' ',finishEverything:'-',gShift:'—'}};
 const team=reportSections(snapshot).find(([title])=>title==='Team Assignment');assert.deepEqual(team[1].map(([label])=>label),['Arrival Lead','Announcement','Carousel','Phone Call']);
 const html=renderBriefingReport(snapshot),svg=renderBriefingImageSvg(snapshot,{photo:true});for(const label of ['Jet-Bridge','Finish everything','G - Shift']){assert(!html.includes('>'+label+'<'));assert(!svg.includes('>'+label+'<'));}
 for(const value of ['Yogesh','Terry','Hana'])assert(svg.includes('>'+value+'<'));
 const empty={...base,fields:{...DEFAULTS}};assert(!reportSections(empty).some(([title])=>title==='Team Assignment'));assert(!renderBriefingImageSvg(empty,{photo:true}).includes('TEAM ASSIGNMENT'));
 const folder=path.resolve('.verification/assignment-layout');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'arrival.png'),await buildBriefingImage(snapshot,{photo:true}));fs.writeFileSync(path.join(folder,'arrival.pdf'),await buildBriefingPdf(snapshot));
});
test('Departure photo combines Counter and Gate as two labeled tables under Team Assignment',async()=>{
 const snapshot={...base,direction:'departure',flight:'MU586',fields:{...DEFAULTS,counterSupervisor:'Supervisor canonical',flightControl:'Norma',counterA59:'Vicky',counterA59Number:'A58',counterA59Service:'Business / Priority',gateLead:'Lead canonical',gateLeadTime:'1015',gateAssist:'Nicholas',gateAssistTime:'1020',announcement:'',gateAnnouncement:'Vicky\nNicholas'},assignmentLabels:{counterSupervisor:'Tamsun',gateLead:'Vicky'}};
 const svg=renderBriefingImageSvg(snapshot,{photo:true});assert.equal((svg.match(/>TEAM ASSIGNMENT</g)||[]).length,1);assert(!svg.includes('>COUNTER ASSIGNMENT<'));assert(!svg.includes('>GATE ASSIGNMENT<'));assert(!svg.includes('OPERATIONAL TIMES'));
 const position=label=>{const match=svg.match(new RegExp('<text x="([\\d.]+)" y="([\\d.]+)"[^>]*>'+label+'</text>'));assert(match,label+' exists');return match.slice(1).map(Number);};const counter=position('Counter'),gate=position('Gate');assert(counter[0]<gate[0]);assert.equal(counter[1],gate[1]);const role=position('Gate Lead'),person=position('Vicky / 1015');assert(role[0]<person[0]);assert(svg.includes('>Tamsun<'));assert(svg.includes('A58 / Business / Priority'));assert(!svg.includes('Supervisor canonical'));
 const folder=path.resolve('.verification/assignment-layout');fs.mkdirSync(folder,{recursive:true});const bytes=await buildBriefingImage(snapshot,{photo:true}),metadata=await sharp(bytes).metadata();assert.equal(metadata.width,1400);assert(metadata.height>=1680);fs.writeFileSync(path.join(folder,'departure.png'),bytes);
});
