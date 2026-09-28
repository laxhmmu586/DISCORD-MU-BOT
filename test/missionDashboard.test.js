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
    fscRateSyncInfo:()=>({}),isFscRateSheetFilled:()=>true,normalizeStatus:(done,count,locked)=>locked?'locked':done?'done':count?'issue':'pending'};
  for(const name of ['setSyDetailsVisible','setText','renderMealOrderColumns','selectMealOrderDay','syncCkinNbrdBnsToBoardingSheet','setBadgeText','setActionIssueState','updateWarningActionState','loadWarningAcknowledgements','refreshSalesReportButton','rememberCompletedSyNode','stopSyAutoRefreshWhenFinalNodesComplete','resetTimelineCenter','rerenderActiveRealtimePanel']) context[name]=()=>{};
  vm.createContext(context);
  vm.runInContext(source('updateFlightFromSy')+'\n'+source('applyMissingBagNodeStatus')+'\n'+source('applyNbrdAcknowledgementState'),context);
  return {context,node:key=>nodes.find(n=>n.dataset.key===key)};
}
test('all dashboard nodes follow the requested order',()=>{
 assert.deepEqual(keys,['CREW_APIS','GD_CHECK','FSC','NEXTDAY_INFO','MEAL_ORDER','INF_TKT','NET','MISSING_BAG','CHD','GOV','WEBEDI','NBRD','WCH','PSM','CCL','CC','INITIAL_FLIGHT','BDT_CHG']);
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
 c.updateFlightFromSy({});for(const [key,time] of [['CCL','1140'],['CC','1210'],['INITIAL_FLIGHT','1220']])assert.equal(node(key).dataset.time,time);
});
test('conditional nodes hide, appear with counts, and hide again on refresh',()=>{
 const {context:c,node}=harness();
 c.updateFlightFromSy({});
 for(const key of ['WCH','PSM','NBRD']) assert.equal(node(key).hidden,true);
 c.updateFlightFromSy({wchList:[{},{}],psmList:[{}],nbrd:[{}],govAqq:{duplicatePassports:['001'],passportCodeIssues:['002','003']}});
 for(const [key,count] of [['WCH','2'],['PSM','1']]) {assert.equal(node(key).hidden,false);assert.equal(node(key).dataset.status,'done');assert.equal(node(key).dataset.time,count);}
 assert.equal(node('NBRD').dataset.time,'1');assert.equal(node('NBRD').hidden,false);
 assert.equal(node('GOV').dataset.time,'1');assert.equal(node('WEBEDI').dataset.time,'2');
 c.updateFlightFromSy({wchList:[],psmList:[],nbrd:[],govAqq:{}});
 for(const key of ['WCH','PSM','NBRD']) assert.equal(node(key).hidden,true);
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
