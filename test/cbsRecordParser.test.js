const test = require('node:test');
const assert = require('node:assert/strict');
const { bagTagSectionHasSerial, extractPnrRecordsForBagTag, splitPnrAndTicketRecord } = require('../cbsRecordParser');

const records = `2026 September 17, Thursday, 09:05:39
>fb3
PR: MU586/17SEP26*LAX,BN3          PNR RL  QCYXPH
CRS RL  JQHKLC
1. LI/GUOJIE        EA2 BN003  63A    V PVG EDI ASR BAG2/32/0 RN M1/0
   CTC-13651757240-SYSTEM
BAGTAG/5006708023/HRB /5006684563/HRB
I/DL3502/17SEP      BN999         V TUS
ACC TUS100218 EDI-DL/16SEP0703 R63A/T

2026 September 18, Friday, 10:43:43
> FB 77
> PR: MU586/18SEP26*LAX,BN77         PNR RL  PD8MDW
> CRS RL  KV947Y
1. YANG/LINYUE          BN077  40G    S PVG EDI
   CTC-13651757240-SYSTEM
BAGTAG/ LA 183946/PVG / LA 183947/PVG /3781590511/PVG /3781499796/PVG
I/LA602/17SEP       BN999         G SCL
ACC SCL100322 EDI-LA/17SEP1512/T`;

test('extracts only the PNR record containing the numeric interline bag tag', () => {
  const found = extractPnrRecordsForBagTag(records, '684563');
  assert.equal(found.length, 1);
  assert.match(found[0], /LI\/GUOJIE/);
  assert.doesNotMatch(found[0], /YANG\/LINYUE/);
});

test('matches spaced airline tags and MU 781 numeric tags by their last six digits', () => {
  assert.match(extractPnrRecordsForBagTag(records, '183947')[0], /LA 183947/);
  assert.match(extractPnrRecordsForBagTag(records, '590511')[0], /3781590511/);
});

test('does not treat a matching phone or ticket number outside BAGTAG as a bag tag', () => {
  assert.equal(bagTagSectionHasSerial('PR: TEST\nCTC-123684563\nBAGTAG/5006708023/HRB', '684563'), false);
});

test('moves ETKD to TKT and removes PD, PU, and SY command output from PNR', () => {
  const source = `2026 September 18, Friday, 13:01:23
PR: MU583/18SEP26*LAX,BN131 PNR RL QHGVYK
1. LIU/XIAOFENG BN131
BAGTAG/3781764663/LAX /3781426503/LAX
I/MU5442/18SEP BN119 J TFU
2026 September 18, Friday, 13:01:55
>etkd 1
ET PROCESSING IN PROGRESS
ETKD:1
ISSUED BY: CHINA EASTERN AIRLINES
PASSENGER: LIU/XIAOFENG
2026 September 18, Friday, 13:02:00
>pn1
FARE: CNY19300.00
2026 September 18, Friday, 13:02:09
>PD*,EDI,NAPI
PD: MU583
2026 September 18, Friday, 13:02:20
>PU1,PSMEXBG0PCQTQK EDI
PU: MU583
2026 September 18, Friday, 13:02:30
>SY
SY: MU583`;
  const result = splitPnrAndTicketRecord(source);
  assert.match(result.pnr, /BAGTAG\/3781764663/);
  assert.doesNotMatch(result.pnr, />etkd|>PD|>PU1|>SY/i);
  assert.match(result.ticket, />etkd 1[\s\S]*ISSUED BY:[\s\S]*PASSENGER:/i);
  assert.doesNotMatch(result.ticket, />pn1|>PD|>PU1|>SY/i);
});
