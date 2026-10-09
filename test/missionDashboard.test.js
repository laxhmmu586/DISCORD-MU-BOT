const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../public/public/index.html'), 'utf8');
const source = (name) => html.slice(html.indexOf(`      function ${name}(`)).split(/\n      (?:async )?function /)[0];
const keys = [...html.matchAll(/class="node"[^>]*data-key="([^"]+)"/g)].map(m => m[1]);
function harness() {
  const nodes = keys.map(key => ({dataset:{key},hidden:false,removeAttribute(){},setAttribute(){}}));
  const element = {classList:{contains:()=>false,remove(){},toggle(){}},setAttribute(){},querySelector(){return this;}};
  const context = {nodes,currentSy:null,lastSyRenderSignature:null,currentWarningAckMap:{},PERSISTENT_GREEN_NODE_KEYS:[],bagReportButton:null,
    document:{querySelector:s=>s.startsWith('.node[')?nodes.find(n=>s.includes(`"${n.dataset.key}"`)):element},
    syRenderSignature:()=>'',countTriple:()=>[],tripleHtml:()=>'',securityReviewPassBnSet:()=>new Set(),govWrongPassportBnList:()=>[],
    unresolvedReviewedBnCount:xs=>(xs||[]).length,webEdiIssueBnList:sy=>sy.govAqq?.passportCodeIssues||[],
    nbrdRowsWithAcknowledgements:sy=>sy.nbrd||[],unacknowledgedNbrdCount:(sy,rows)=>rows.filter(r=>!r.acked).length,
    buildWarningRows:()=>[],duplicateBagRows:()=>[],duplicateNameRows:()=>[],completedSyNodeState:()=>({}),stepByKey:()=>({complete:true,time:'1200'}),
    fscRateSyncInfo:()=>({}),isFscRateSheetFilled:()=>true,ticketMatchAudit:()=>({ready:false,match:false,differences:[0,0,0]}),normalizeStatus:(done,count,locked)=>locked?'locked':done?'done':count?'issue':'pending'};
  for(const name of ['setSyDetailsVisible','setText','renderMealOrderColumns','selectMealOrderDay','syncCkinNbrdBnsToBoardingSheet','setBadgeText','setActionIssueState','updateWarningActionState','loadWarningAcknowledgements','refreshSalesReportButton','rememberCompletedSyNode','stopSyAutoRefreshWhenFinalNodesComplete','resetTimelineCenter','rerenderActiveRealtimePanel']) context[name]=()=>{};
  vm.createContext(context);
  vm.runInContext(source('updateFlightFromSy')+'\n'+source('applyMissingBagNodeStatus')+'\n'+source('applyNbrdAcknowledgementState'),context);
  return {context,node:key=>nodes.find(n=>n.dataset.key===key)};
}
test('all dashboard nodes follow the requested order',()=>{
 assert.deepEqual(keys,['CREW_APIS','GD_CHECK','MEAL_ORDER','FSC','INF_TKT','NEXTDAY_INFO','TKT','NET','MISSING_BAG','CHD','GOV','WEBEDI','NBRD','DUP_BAG','WCH','DUP_NAME','PSM','CCL','CC','INITIAL_FLIGHT','BDT_CHG']);
 for (const key of ['MEAL_ORDER','INF_TKT','TKT']) assert.match(html,new RegExp(`data-key="${key}"[^>]*data-timeline-side="top"`));
});

test('CKIN NBRD sync is deduplicated and clears resolved rows on both sheets', async () => {
 const calls=[];
 const c={currentSy:null,enrichRowsWithPassengerData:rows=>rows,console,
  apiJson:async(endpoint,options)=>{calls.push({endpoint,...JSON.parse(options.body)});}};
 vm.createContext(c);
 vm.runInContext(['ckinNbrdLines','ckinNbrdDetails','rowHasCkinNbrdIssue','syncCkinNbrdBnsToBoardingSheet'].map(source).join('\n'),c);
 const sy={flightNo:'MU586',flightDate:'01OCT26',bnAudit:[
  {bn:'12',passengerRecord:{gateComments:['CKIN NBRD CHECK DOCUMENT']}},
  {bn:'13',offloaded:true,passengerRecord:{gateComments:['CKIN NBRD OFFLOADED']}},
  {bn:'14',passengerRecord:{gateComments:['CKIN OK']}},
 ]};
 c.syncCkinNbrdBnsToBoardingSheet(sy);
 assert.deepEqual(calls.map(x=>x.endpoint),['/cbs-scan/nbrd-bns']);
 assert.deepEqual(calls[0].entries,[{bn:'0012',detail:'CKIN NBRD CHECK DOCUMENT'}]);
 assert.equal(calls[0].replace,true);
 c.syncCkinNbrdBnsToBoardingSheet(sy);
 assert.equal(calls.length,1);
 c.syncCkinNbrdBnsToBoardingSheet({...sy,bnAudit:[]});
 assert.equal(calls.length,2);
 assert.deepEqual(calls[1].entries,[]);
});

test('a failed mirrored NBRD sync retries on the next refresh', async () => {
 const calls=[];let fail=true;
 const c={currentSy:null,enrichRowsWithPassengerData:rows=>rows,console:{warn(){}},
  apiJson:async(endpoint)=>{calls.push(endpoint);if(fail) throw new Error('temporary failure');}};
 vm.createContext(c);
 vm.runInContext(['ckinNbrdLines','ckinNbrdDetails','rowHasCkinNbrdIssue','syncCkinNbrdBnsToBoardingSheet'].map(source).join('\n'),c);
 const sy={flightNo:'MU586',flightDate:'01OCT26',bnAudit:[]};
 c.syncCkinNbrdBnsToBoardingSheet(sy);
 await new Promise(resolve=>setImmediate(resolve));
 fail=false;
 c.syncCkinNbrdBnsToBoardingSheet(sy);
 assert.deepEqual(calls,['/cbs-scan/nbrd-bns','/cbs-scan/nbrd-bns']);
 c.syncCkinNbrdBnsToBoardingSheet({...sy,flightDate:'02OCT26'});
 assert.equal(calls.length,3);
});
test('DUP NAME and CHD LIST load count styling instead of the completed check mark',()=>{
 const css=fs.readFileSync(require.resolve('../public/public/assets/mission-dashboard.css'),'utf8');
 assert.match(html,/mission-dashboard\.css\?v=20261008-rail-dot-glow/);
 assert.match(css,/data-key="CHD"[^}]*\) \.node-value::after \{ content:attr\(data-value\)/);
 assert.match(css,/data-key="DUP_NAME"[^}]*\) \.node-value::after \{ content:attr\(data-value\)/);
});
test('CHD LIST displays the total child count while retaining missing-code status',()=>{
 const {context:c,node}=harness();
 c.updateFlightFromSy({chdList:[{hasChdCode:true},{hasChdCode:true}]});
 assert.equal(node('CHD').dataset.status,'done');assert.equal(node('CHD').dataset.time,'2');
 c.updateFlightFromSy({chdList:[{hasChdCode:true},{hasChdCode:false},{hasChdCode:true}]});
 assert.equal(node('CHD').dataset.status,'issue');assert.equal(node('CHD').dataset.time,'3');assert.equal(node('CHD').dataset.alert,'1');
});
test('CHD LIST and WEB/EDI/RS display zero as a completed check',()=>{
 const {context:c,node}=harness();
 c.updateFlightFromSy({chdList:[],govAqq:{}});
 for(const key of ['CHD','WEBEDI']) {
  assert.equal(node(key).dataset.status,'done');
  assert.equal(node(key).dataset.time,'0');
 }
});
test('DUP BAG is a conditional timeline node after NBRD and is not moved into the flight menu',()=>{
 const {context:c,node}=harness();
 c.duplicateBagRows=()=>[{},{}];
 c.updateFlightFromSy({});
 assert.equal(node('DUP_BAG').hidden,false);
 assert.equal(node('DUP_BAG').dataset.status,'issue');
 assert.equal(node('DUP_BAG').dataset.time,'2');
 assert.doesNotMatch(html,/\["duplicate-bags-action", "duplicate-names-action"\]/);
 assert.match(source('renderStepPanel'),/key === "DUP_BAG"[\s\S]*renderDuplicateBagsPanel/);
});
test('TKT matches C against CET plus unticketed INAD by cabin',()=>{
 const rows=[
  {cabin:'Economy',specialServices:['INAD'],ticketNo:''},
  {cabin:'Business',specialServices:['INAD'],ticketNo:'7810000000001'},
 ];
 const c={warningRecordPools:()=>rows,isDeletedPassengerRecord:()=>false,hasTicket:r=>Boolean(r.ticketNo),rowActiveServiceCodes:r=>(r.specialServices||[]).join('/'),currentSy:null};
 vm.createContext(c);vm.runInContext(source('countTriple')+'\n'+source('ticketMatchAudit'),c);
 const audit=c.ticketMatchAudit({checkedIn:['','002','021','096'],checkedInTicketed:['','002','021','095']});
 assert.equal(audit.match,true);
 assert.deepEqual(Array.from(audit.inad),[0,0,1]);
 assert.deepEqual(Array.from(audit.adjustedTicketed),[2,21,96]);
 assert.equal(c.ticketMatchAudit({checkedIn:['','002','021','096'],checkedInTicketed:['','002','020','095']}).match,false);
});
test('INF TKT click panel renders passenger and ticket details instead of generic timeline status',()=>{
 const detail=source('infTicketNodeDetailHtml');
 const popup=source('showTimelineNodeCard');
 assert.match(detail,/Adult ticket/);
 assert.match(detail,/Infant ticket/);
 assert.doesNotMatch(detail,/<b>Infant<\/b>/);
 assert.match(detail,/MISSING — added to WARNING/);
 assert.match(popup,/key === "INF_TKT"[\s\S]*infTicketNodeDetailHtml\(\)/);
});
test('rail meteor is measured from the shared timeline rail',()=>{
 const orbit=fs.readFileSync(require.resolve('../public/public/assets/orbit-interface.js'),'utf8');
 const css=fs.readFileSync(require.resolve('../public/public/assets/mission-dashboard.css'),'utf8');
 assert.match(orbit,/getPropertyValue\('--timeline-rail-y'\)/);
 assert.match(orbit,/scanner\.style\.top=\(railY-10\)/);
 assert.match(orbit,/scanner\.style\.width=distance\+'px'/);
 assert.match(css,/\.timeline-shell::after \{[^}]*width:100vw; height:2px/);
 assert.match(css,/\.timeline::before \{\s*display:none;/);
});
test('timeline stays horizontally scrollable without showing a scrollbar',()=>{
 const css=fs.readFileSync(require.resolve('../public/public/assets/mission-dashboard.css'),'utf8');
 assert.match(css,/\.timeline \{[^}]*overflow-x:auto;[^}]*scrollbar-width:none;[^}]*-ms-overflow-style:none;/);
 assert.match(css,/\.timeline::\-webkit-scrollbar \{[^}]*display:none;[^}]*height:0;/);
 assert.doesNotMatch(css,/scrollbar-width:thin/);
});
test('NEXTDAY INFO and NET keep same-row spacing while INF TKT renders its ticket count',()=>{
 const css=fs.readFileSync(require.resolve('../public/public/assets/mission-dashboard.css'),'utf8');
 const compactRule=css.match(/\.timeline \.node\[data-key="MEAL_ORDER"\],[\s\S]*?\{ margin-left:-54px; \}/)?.[0] || '';
 assert.doesNotMatch(compactRule,/NEXTDAY_INFO/);
 assert.match(css,/data-key="INF_TKT"\] \.node-value::after[\s\S]*?content:attr\(data-value\)/);
});
test('INF TKT value is the number of infant tickets, not passenger rows or missing tickets',()=>{
 const {context:c,node}=harness();
 c.updateFlightFromSy({infTicketAudit:[{infantTicketNo:'7811'},{infantTicketNo:'7812'},{infantTicketNo:''}]});
 assert.equal(node('INF_TKT').dataset.time,'2');
 assert.equal(node('INF_TKT').dataset.status,'issue');
 assert.equal(node('INF_TKT').dataset.alert,'1');
 c.updateFlightFromSy({infTicketAudit:[{infantTicketNo:'7811'},{infantTicketNo:'7812'}]});
 assert.equal(node('INF_TKT').dataset.time,'2');
 assert.equal(node('INF_TKT').dataset.status,'done');
});
test('warning disappears only when every row has been acknowledged by the current user',()=>{
 const action={hidden:false,classList:{toggle(){}}},manifest={classList:{toggle(){}}};
 const c={document:{querySelector:s=>s==='#warning-action'?action:manifest},setText(){},currentUserName:()=> 'lake'};
 vm.createContext(c);vm.runInContext(source('userHasAcknowledged')+'\n'+source('updateWarningActionState'),c);
 c.updateWarningActionState([{acknowledgements:[{by:'lake'}]},{acknowledgements:[]}]);assert.equal(action.hidden,false);
 c.updateWarningActionState([{acknowledgements:[{by:'lake'}]},{acknowledgements:[{by:'LAKE'}]}]);assert.equal(action.hidden,true);
 c.updateWarningActionState([{acknowledgements:[]}]);assert.equal(action.hidden,false);
 c.updateWarningActionState([]);assert.equal(action.hidden,true);
});
test('CCL, CC and initial-flight timestamps survive SY refresh',()=>{
 const {context:c,node}=harness();c.stepByKey=key=>({complete:true,time:({CCL:'1140',CC:'1210',INITIAL_FLIGHT:'1220'})[key]||'0900'});
 c.updateFlightFromSy({flightNo:'MU586'});for(const [key,time] of [['CCL','1140'],['CC','1210'],['INITIAL_FLIGHT','1220']])assert.equal(node(key).dataset.time,time);
});
test('unchanged background reconciliation updates data without repainting the dashboard',()=>{
 const {context:c}=harness();let writes=0;
 c.syRenderSignature=()=> 'same-visible-data';
 c.setText=()=>{writes+=1;};
 const first={flightNo:'MU586',flightDate:'28SEP26'};
 c.updateFlightFromSy(first,{skipUnchanged:true});
 assert.ok(writes>0);
 const writesAfterFirstRender=writes;
 const reconciled={flightNo:'MU586',flightDate:'28SEP26',serverOnlyValue:'new'};
 c.updateFlightFromSy(reconciled,{skipUnchanged:true});
 assert.equal(writes,writesAfterFirstRender);
 assert.equal(c.currentSy,reconciled);
});
test('conditional nodes hide, appear with counts, and hide again on refresh',()=>{
 const {context:c,node}=harness();
 c.updateFlightFromSy({});
 for(const key of ['WCH','DUP_NAME','PSM','NBRD']) assert.equal(node(key).hidden,true);
 c.duplicateNameRows=()=>[{}, {}, {}];
 c.updateFlightFromSy({wchList:[{},{}],psmList:[{}],nbrd:[{}],govAqq:{duplicatePassports:['001'],passportCodeIssues:['002','003']}});
 for(const [key,count] of [['WCH','2'],['DUP_NAME','3'],['PSM','1']]) {assert.equal(node(key).hidden,false);assert.equal(node(key).dataset.status,'done');assert.equal(node(key).dataset.time,count);}
 assert.equal(node('NBRD').dataset.time,'1');assert.equal(node('NBRD').hidden,false);
 assert.equal(node('GOV').dataset.time,'1');assert.equal(node('WEBEDI').dataset.time,'2');
 c.duplicateNameRows=()=>[];
 c.updateFlightFromSy({wchList:[],psmList:[],nbrd:[],govAqq:{}});
 for(const key of ['WCH','DUP_NAME','PSM','NBRD']) assert.equal(node(key).hidden,true);
 assert.equal(node('GOV').dataset.time,'0');assert.equal(node('WEBEDI').dataset.time,'0');
});
test('missing bags hide at zero and NBRD retains total after acknowledgement',()=>{
 const {context:c,node}=harness();
 c.applyMissingBagNodeStatus(0);assert.equal(node('MISSING_BAG').hidden,true);
 c.applyMissingBagNodeStatus(2);assert.equal(node('MISSING_BAG').hidden,false);assert.equal(node('MISSING_BAG').dataset.time,'2');
 c.applyMissingBagNodeStatus(0);assert.equal(node('MISSING_BAG').hidden,true);
 c.applyNbrdAcknowledgementState({nbrd:[{acked:true}],bnAudit:[{}]});
 assert.equal(node('NBRD').dataset.status,'done');assert.equal(node('NBRD').dataset.time,'1');assert.equal(node('NBRD').hidden,false);
});
test('dashboard script parses',()=>{
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
test('horizontal rail lays out every node without fixed orbit coordinates',()=>{
 const nodes = keys.map(key=>({dataset:{key,label:key,time:'0'},setAttribute(){}}));
 const context = {nodes};vm.createContext(context);
 vm.runInContext(source('placeNodes')+'\nplaceNodes();',context);
});
test('drag starts on cards after a threshold while touch keeps native scrolling',()=>{
 const classes=new Set();let captured=null;
 const timeline={scrollLeft:100,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},setPointerCapture:id=>captured=id,hasPointerCapture:id=>captured===id,releasePointerCapture:()=>captured=null};
 const c={timeline,timelinePointerId:null,didDrag:false,dragStartX:0,lastDragX:0};vm.createContext(c);
 vm.runInContext(source('beginTimelineDrag')+'\n'+source('moveTimelineDrag')+'\n'+source('endTimelineDrag'),c);
 const event={pointerId:1,pointerType:'mouse',button:0,clientX:200,target:{closest:s=>s==='.node'?{}:null},preventDefault(){}};
 c.beginTimelineDrag(event);c.moveTimelineDrag({...event,clientX:198});assert.equal(timeline.scrollLeft,100);assert.equal(c.didDrag,false);
 c.moveTimelineDrag({...event,clientX:140});assert.equal(timeline.scrollLeft,160);assert.equal(c.didDrag,true);assert.equal(captured,1);
 c.endTimelineDrag(event);assert.equal(captured,null);assert.equal(c.didDrag,true);
 c.beginTimelineDrag({...event,pointerType:'touch'});assert.equal(c.timelinePointerId,null);assert.equal(c.didDrag,false);
});
test('normal details center on desktop and mobile while full-page tools keep their layout',()=>{
 const classes=new Set();const c={resultPanel:{style:{},classList:{remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)}}};vm.createContext(c);
 vm.runInContext(source('positionMobileResultPanel'),c);
 assert.equal(c.positionMobileResultPanel(),true);assert.equal(classes.has('is-centered-popup'),true);
 assert.equal(c.positionMobileResultPanel({panelClass:'is-full-page'}),false);assert.equal(classes.has('is-centered-popup'),false);
});

 test('final command nodes only appear for MU586 and MU578 across refresh and flight switches',()=>{
 const {context:c,node}=harness();
 for (const flightNo of ['MU586','MU9586','MU578','MU9578','MU586A','', 'MU586']) {
   for(let refresh=0;refresh<2;refresh++) {
     c.updateFlightFromSy({flightNo});
     for(const key of ['INITIAL_FLIGHT','BDT_CHG']) assert.equal(node(key).hidden,!['MU586','MU578'].includes(flightNo),flightNo+' '+key);
   }
 }
 for(const key of ['INITIAL_FLIGHT','BDT_CHG']) assert.match(html,new RegExp('data-key="'+key+'" hidden'));
 });
