const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/public/cbs.html'),'utf8');
const ctx=vm.createContext({apiBase:'https://fixture.invalid',document:{documentElement:{lang:'en'}},BaggageGuide:require('../public/public/baggage-guide'),PirDelivery:require('../public/public/pir-delivery')});
const names=['label','escapeHtml','inferCaseType','hasValue','normalizeShippingMethodLabel','renderValue','detailRows','originalFormDetailRows','fullPassengerFileHtml'];
for(const name of names){const start=source.indexOf(`function ${name}(`);vm.runInContext(source.slice(start,source.indexOf('\n    function ',start+1)),ctx);}
const ref=n=>`${n}-1-${String(n).repeat(64)}`;
const record={caseType:'DPR',dprDamageLevel:'Minor',dprInnerDamage:'REMOVED_INNER',damagedBags:[{tag:'MU000001',damageLevel:'Minor',innerDamage:'REMOVED_INNER',damageAreas:['back'],damageSketchRef:ref(1)},{tag:'DL000002',damageSketchRef:ref(2)}]};
test('DPR renders each saved marked image under its own tag and hides removed answers in both languages',()=>{
 for(const language of ['en','zh']){ctx.document.documentElement.lang=language;const html=ctx.fullPassengerFileHtml({originalFormData:JSON.stringify(record)});
  assert.equal((html.match(/<figure class="dpr-marked-image">/g)||[]).length,2);assert(html.includes(`https://fixture.invalid/cbs-damage-images/${ref(1)}`));assert(html.includes(`https://fixture.invalid/cbs-damage-images/${ref(2)}`));
  assert(html.indexOf('MU000001')<html.indexOf(ref(1)));assert(html.indexOf('DL000002')<html.indexOf(ref(2)));
  assert.doesNotMatch(html,/Minor|REMOVED_INNER|Damage level|Inner damage|破损程度|内物破损/);
  for(const fn of ['detailRows','originalFormDetailRows'])assert(!JSON.stringify(ctx[fn](record)).includes('REMOVED_INNER'));
 }
});
test('legacy missing images and unsafe sources never fabricate a diagram or executable URL',()=>{
 ctx.document.documentElement.lang='en';const html=ctx.fullPassengerFileHtml({caseType:'DPR',damagedBags:[{tag:'<script>',damageSketch:'javascript:alert(1)',damageSketchRef:'../../secret'}]});assert(html.includes('No saved marked image'));assert(html.includes('&lt;script&gt;'));assert.doesNotMatch(html,/<img|javascript:|\.\.\/secret/);
 assert(!ctx.fullPassengerFileHtml({...record,caseType:'AHL'}).includes('dpr-marked-image'));
});
