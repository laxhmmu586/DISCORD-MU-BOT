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

test('FB unique local BN count matches SY C cabin sum; infant is separate and added to total', () => {
  const data = parse([sy(), fb(1,{infant:true}), fb(3), fb(3,{time:'14:02:00'})].join('\n'));
  assert.deepEqual(data.bns,[1,3]);
  assert.deepEqual(data.infantBns,[1]);
  assert.equal(data.passengers,2); assert.equal(data.infants,1); assert.equal(data.total,3);
  assert.equal(data.expectedPassengers,2); assert.equal(data.expectedTotal,3); assert.equal(data.matched,true);
});
test('count gaps are real gaps, never inferred from max BN; mismatches in either total fail', () => {
  const data = parse([sy(3,0),fb(1),fb(320)].join('\n'));
  assert.equal(data.passengers,2); assert.equal(data.matched,false);
  assert.equal(parse([sy(2,1),fb(1),fb(2)].join('\n')).matched,false);
});
for (const reverse of [false,true]) test(`empty FB invalidation, deleted passengers and other flight/date isolation (${reverse})`, () => {
  const parts = [sy(1,0),fb(1),fb(2),fb(2,{deleted:true,time:'14:02:00'}),fb(3),
    '2026 October 16, Friday, 14:03:00\n>fb 3\nPSGR ID',
    fb(4,{flight:'MU578'}),fb(5,{date:'15OCT26'}),fb(6,{command:'pr1pd'})];
  const data = parse((reverse ? parts.reverse() : parts).join('\n'));
  assert.deepEqual(data.bns,[1]); assert.equal(data.matched,true);
});
test('new successful FB restores an empty lookup and latest SY counts win', () => {
  const log = [sy(2,0),fb(1),'2026 October 16, Friday, 14:03:00\n>fb 1\nPSGR ID',fb(1,{time:'14:04:00'}),sy(1,0).replace('14:00:00','14:05:00')].join('\n');
  assert.equal(parse(log).matched,true);
});
test('unknown SY counts cannot claim a match; no SY stays unavailable', () => {
  assert.equal(parse(sy(0,0).replace('C000/000/000','')).matched,false);
  assert.equal(parse(sy(0,0).replace('I00','')).expectedInfants,null);
  assert.equal(parse(fb(1)),null);
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
  const data = parse([supplied,...bns.map(bn=>fb(bn,{infant:bn<=6}))].join('\n'));
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
