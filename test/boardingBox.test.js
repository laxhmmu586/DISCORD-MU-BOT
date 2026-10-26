'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findBoardingBoxInfo } = require('../syParser');
const { scopedLog } = require('../flightContext');
const { groupBns } = require('../public/public/box');
const sy = (count = 2, infants = 1, flight = 'MU586', date = '16OCT26') => `2026 October 16, Friday, 14:00:00
>sy
> SY: ${flight}/${date} LAX/0 CI1400/NAM
 C000/000/${String(count).padStart(3,'0')} CET000/000/999 I${String(infants).padStart(2,'0')}`;
const fb = (bn, { time='14:01:00', infant=false, deleted=false, flight='MU586', date='16OCT26', command=`fb ${bn}` } = {}) => `2026 October 16, Friday, ${time}
>${command}
 PR: ${flight}/${date}*LAX,BN${bn}
 1. TEST/PASSENGER BN${bn} 20A Y PVG ${deleted ? 'DELETED' : 'FBA/2PC'}
 ${infant ? 'INF-TEST/BABY INF1/0\n ET TKNE/INF1234567890123/1' : ''}
 O/DL389/17OCT BN999 30A JFK`;
const parse = log => findBoardingBoxInfo(scopedLog(log, 'MU586', '16OCT26'), 'MU586', '16OCT26');
const rangeFixture = require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/boarding-box-bnd-ranges.log'),'utf8');
const parseRanges = log => findBoardingBoxInfo(scopedLog(log,'MU586','19OCT26'),'MU586','19OCT26');

test('October 26 BND with no deletion block includes all 292 BNs', () => {
  const supplied = require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/boarding-box-no-deletions.log'),'utf8');
  const parse = log => findBoardingBoxInfo(scopedLog(log,'MU586','26OCT26'),'MU586','26OCT26');
  const data = parse(supplied);
  assert.ok(data);
  assert.equal(data.source,'BND'); assert.equal(data.maxBn,292);
  assert.deepEqual(data.bns,Array.from({length:292},(_,i)=>i+1));
  assert.equal(data.expectedPassengers,292); assert.equal(data.expectedInfants,2);
  assert.equal(data.total,294); assert.equal(data.matched,true);
  assert.ok(groupBns(data.bns,data.maxBn).groups.every(group=>!group.absent.length));
  assert.equal(parse(supplied.replace(/  NONLAX:[^\n]*/,'')),null);
  for (const declaration of ['1 BOARDING NUMBER(S) DELETED:', 'BOARDING NUMBER(S) DELETED:']) {
    assert.equal(parse(supplied.replace('  NONLAX:',` ${declaration}\n  NONLAX:`)),null);
  }
});

test('supplied October 19 BND expands deleted ranges and preserves NONLAX numbers', () => {
  for (const log of [rangeFixture, rangeFixture.replace('48  72-76  82','48  72-76\n    82')]) {
    const data = parseRanges(log);
    assert.ok(data); assert.equal(data.source,'BND'); assert.equal(data.maxBn,308);
    assert.equal(data.expectedPassengers,298); assert.equal(data.passengers,298);
    assert.equal(data.infants,2); assert.equal(data.total,300); assert.equal(data.matched,true);
    const {groups} = groupBns(data.bns,data.maxBn);
    assert.deepEqual(groups.flatMap(group=>group.absent),[48,72,73,74,75,76,82,85,104,132]);
    assert.deepEqual(groups.find(group=>group.start===61).absent,[72,73,74,75,76]);
    for (const bn of [1,14,62,65,68,70,77,78,81,88,91,103,105,131,133,141]) assert.ok(data.bns.includes(bn));
    assert.equal(groups.at(-1).end,308); assert.equal(groups.at(-1).count,8);
  }
});

test('BND deletion ranges reject wrong counts, reversed, overlapping, malformed and out-of-range values', () => {
  for (const list of ['48 72-75 82 85 104 132','48 76-72 82 85 104 132',
    '48 72-76 76 85 104 132','48 72-76x 82 85 104 132','48 72-76 82 85 104 309']) {
    assert.equal(parseRanges(rangeFixture.replace('48  72-76  82  85  104  132',list)),null,list);
  }
});
const bnd = (end=303, removed=[8,28,63,65,73], flight='MU586') => `2026 October 16, Friday, 14:02:00
>BND:
 BND: ${flight}/16OCT26LAX
 BOARDING NUMBER RANGE: 1--${end}
 ${removed.length} BOARDING NUMBER(S) DELETED:
 ${removed.join('  ')}
 NONLAX: 1-7 9-10 91 93-94 98 106-157
`;

test('BND supplies the full range excluding only deleted numbers, retaining NONLAX', () => {
  const data = parse([sy(298,0),bnd()].join('\n'));
  assert.equal(data.source,'BND'); assert.equal(data.maxBn,303);
  assert.equal(data.passengers,298); assert.equal(data.matched,true);
  assert.deepEqual(Array.from({length:303},(_,i)=>i+1).filter(bn=>!data.bns.includes(bn)),[8,28,63,65,73]);
  const last = groupBns(data.bns,data.maxBn).groups.at(-1);
  assert.equal(last.end,303); assert.equal(last.count,3);
});

test('BND selects latest valid matching flight snapshot and rejects incomplete deletion lists', () => {
  for (const reverse of [false,true]) {
    const parts = [sy(298,0),bnd(),bnd(304).replace('14:02:00','14:03:00'),bnd(400,[],'MU578')];
    const data = parse((reverse ? parts.reverse() : parts).join('\n'));
    assert.equal(data.maxBn,304); assert.equal(data.passengers,299);
  }
  assert.equal(parse([sy(1,0),fb(1),bnd().replace('5 BOARDING','6 BOARDING')].join('\n')),null);
  assert.equal(parse([sy(3,0),bnd(3,[])].join('\n')).passengers,3);
});

test('BND remains authoritative over FB and uses SY infants without infant FB lookups', () => {
  const data = parse([sy(3,2),fb(1,{deleted:true}),bnd(3,[]),fb(2,{deleted:true,time:'14:03:00'})].join('\n'));
  assert.deepEqual(data.bns,[1,2,3]);
  assert.equal(data.infants,2); assert.equal(data.total,5); assert.equal(data.matched,true);
});

test('BOX requires SY and valid BND; FB alone or with SY cannot supply numbers', () => {
  assert.equal(parse([sy(),fb(1),fb(3)].join('\n')),null);
  assert.equal(parse([fb(1),bnd()].join('\n')),null);
  assert.equal(parse([sy(),bnd(3,[],'MU578')].join('\n')),null);
  assert.equal(parse([sy(),bnd().replace('16OCT26LAX','15OCT26LAX')].join('\n')),null);
});

test('latest SY counts win and incomplete SY totals cannot claim a match', () => {
  const data = parse([sy(2,0),bnd(3,[]),sy(3,0).replace('14:00:00','14:05:00')].join('\n'));
  assert.equal(data.matched,true);
  assert.equal(parse([sy(0,0).replace('C000/000/000',''),bnd(3,[])].join('\n')).matched,false);
  assert.equal(parse([sy(0,0).replace('I00',''),bnd(3,[])].join('\n')).expectedInfants,null);
});

test('twenty BN ranges flag 19 or fewer, including last partial box; 301 starts a new range', () => {
  const values = Array.from({length:320},(_,i) => i+1).filter(bn => bn !== 157);
  const {groups} = groupBns([...values,1]);
  assert.equal(groups.find(g=>g.start===141).count,19);
  assert.equal(groups.find(g=>g.start===141).low,true);
  assert.deepEqual(groups.find(g=>g.start===141).absent,[157]);
  assert.equal(groups.find(g=>g.start===301).count,20);
  assert.equal(groups.find(g=>g.start===301).end,320);
  assert.equal(groups.find(g=>g.start===301).low,false);
  assert.deepEqual(groups.find(g=>g.start===301).absent,[]);
  assert.equal(groups[0].column,4); assert.equal(groups[0].row,1);
  assert.equal(groupBns([1,2,21]).groups[1].count,1);
});

test('supplied SY BN312 bounds the final box while 310 passengers and 6 infants reconcile', () => {
  const supplied = require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/boarding-box-sy312.log'),'utf8');
  const bns = Array.from({length:312},(_,i)=>i+1).filter(bn=>![86,150].includes(bn));
  const data = parse([supplied,bnd(312,[86,150]),...bns.map(bn=>fb(bn,{infant:bn<=6}))].join('\n'));
  assert.equal(data.maxBn,312); assert.equal(data.expectedPassengers,310); assert.equal(data.infants,6);
  assert.equal(data.total,316); assert.equal(data.matched,true);
  const {groups} = groupBns(data.bns,data.maxBn), last = groups.at(-1);
  assert.equal(last.start,301); assert.equal(last.end,312); assert.equal(last.count,12);
  assert.equal(last.low,false); assert.deepEqual(last.absent,[]);
  assert.deepEqual(groups.find(g=>g.start===81).absent,[86]);
});
test('SY upper bound reveals a skipped last BN and never invents 313 through 320', () => {
  const {groups} = groupBns([301,302,303,304,305,306,307,308,309,310,311],312);
  assert.deepEqual(groups.at(-1).absent,[312]); assert.equal(groups.at(-1).low,true);
  assert.equal(groups.at(-1).end,312);
  assert.deepEqual(groupBns([301,302,304],304).groups.at(-1).absent,[303]);
});
