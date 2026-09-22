const test = require('node:test');
const assert = require('node:assert/strict');
const { passengers, parseIncrementalLog } = require('../flightParser');

test('does not treat WCHC advisory MSG or operational history as an active service', () => {
  const log = [
    '2026 September 22, Tuesday, 12:51:29',
    '> fb 291',
    '> PR: MU586/22SEP26*LAX,BN291 PNR RL NG8118',
    '1. JIANG/CHANGRAN BN291 *34H S PVG BAG1/23/0',
    'ET TKNE/7817507226536/2',
    '\u001cMSG-*** CHECK PAX CONDITION FOR WCHC OR CTC LAKE ***\u001d',
    '2026 September 22, Tuesday, 12:51:41',
    '> fb 292',
    '> PR: MU586/22SEP26*LAX,BN292 PNR RL NG8118',
    '1. LI/YANXI BN292 *34G S PVG BAG1/23/0',
    'PSM-//WCHR NN1 /WCHS NN1 //DOCS HK1',
    'MOD LAX60116 AGT21470/22SEP0915/WCHC',
    'MOD LAX49020 AGT24102/22SEP1127/WCHR'
  ].join('\n');

  parseIncrementalLog(log);

  assert.deepEqual(passengers['291'].specialServices, []);
  assert.deepEqual(passengers['292'].specialServices, []);
});
