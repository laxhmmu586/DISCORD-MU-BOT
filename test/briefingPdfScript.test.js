const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/apps-script/BriefingPDF.gs'), 'utf8');

test('arrival and departure export portrait Letter on one page with narrow margins',()=>{
 const h=harness(),blob={getBytes:()=>[37,80,68,70,45],setName(){return this;},setContentType(){return this;}};
 const urls=[];
 h.ctx.ScriptApp.getOAuthToken=()=> 'token';
 h.ctx.UrlFetchApp={fetch:url=>{urls.push(new URL(url));return {getResponseCode:()=>200,getBlob:()=>blob};}};
 h.ctx.DriveApp={getFolderById:()=>({createFile:()=>({getId:()=> 'new',getName:()=> 'briefing.pdf'}),getFilesByName:()=>({hasNext:()=>false})})};
 for(const gid of [1,2])h.ctx.createBriefingPDF({getId:()=> 'sheet'},{getSheetId:()=>gid},'briefing','A1:R67');
 for(const url of urls){const q=url.searchParams;assert.equal(q.get('portrait'),'true');assert.equal(q.get('size'),'letter');assert.equal(q.get('scale'),'4');assert.equal(q.get('range'),'A1:R67');assert.equal(q.get('left_margin'),'0.10');assert.equal(q.get('right_margin'),'0.10');}
});

function harness() {
  let instant = '2026-07-01T15:48:00Z';
  let triggers = [];
  const props = {};
  const calls = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } }
  const ctx = vm.createContext({ Date: Clock, Logger: { log() {} },
    Utilities: { formatDate: d => d.toISOString().slice(0, 10),
      base64Encode: bytes => Buffer.from(bytes).toString('base64') },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key],
      setProperty: (key, value) => { props[key] = value; } }) },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      newTrigger: handler => ({ timeBased() { return this; }, everyMinutes(n) {
        assert.equal(n, 1);
        return { create() { triggers.push({ getHandlerFunction: () => handler }); } };
      } }),
      deleteTrigger: t => { triggers = triggers.filter(item => item !== t); }
    }
  });
  vm.runInContext(source, ctx);
  ctx.sendArrivalPDFtoDiscord = () => calls.push('MU583');
  ctx.sendDeparturePDFtoDiscord = () => calls.push('MU586');
  return { ctx, calls, props, time: value => { instant = value; }, triggers: () => triggers };
}

test('sends at 08:49 PDT and 07:49 PST, once per flight and day', () => {
  const h = harness();
  h.ctx.scheduledBriefingPDFs();
  assert.deepEqual(h.calls, []);
  for (const time of ['2026-07-01T08:49:00-07:00', '2026-12-01T07:49:00-08:00']) {
    h.time(time);
    h.ctx.scheduledBriefingPDFs();
    h.ctx.scheduledBriefingPDFs();
  }
  assert.deepEqual(h.calls, ['MU583', 'MU586', 'MU583', 'MU586']);
});

test('allows delayed dispatch inside the window and stops at 16:04 UTC', () => {
  const h = harness();
  h.time('2026-07-01T16:03:00Z'); h.ctx.scheduledBriefingPDFs();
  h.time('2026-07-02T16:04:00Z'); h.ctx.scheduledBriefingPDFs();
  assert.deepEqual(h.calls, ['MU583', 'MU586']);
});

test('does not resend ambiguous failures and still attempts the other flight', () => {
  const h = harness();
  h.time('2026-07-01T15:49:00Z');
  h.ctx.sendArrivalPDFtoDiscord = () => { h.calls.push('MU583'); throw new Error('timeout'); };
  assert.throws(() => h.ctx.scheduledBriefingPDFs(), /timeout/);
  h.ctx.scheduledBriefingPDFs();
  assert.deepEqual(h.calls, ['MU583', 'MU586']);
  assert.match(h.props.BRIEFING_PDF_MU583_STATUS, /^failed:/);
  assert.equal(h.props.BRIEFING_PDF_MU586_STATUS, 'sent');
});

test('reinstall replaces its checker and remove disables it', () => {
  const h = harness();
  h.ctx.installBriefingPDFTrigger(); h.ctx.installBriefingPDFTrigger();
  assert.equal(h.triggers().length, 1);
  assert.deepEqual(h.calls, []);
  h.ctx.removeBriefingPDFTrigger(); assert.equal(h.triggers().length, 0);
});

test('sends PDF bytes in JSON and rejects an old server that sends text only', () => {
  const h = harness();
  const bytes = [...Buffer.from('%PDF-1.4\ntest')];
  const blob = { getBytes: () => bytes, getName: () => 'briefing.pdf' };
  let payload;
  h.ctx.UrlFetchApp = { fetch: (url, options) => {
    payload = JSON.parse(options.payload);
    return { getResponseCode: () => 200,
      getContentText: () => '{"success":true,"attachmentCount":1}' };
  } };
  h.ctx.sendToDiscordAPI('123', 'Briefing', blob);
  assert.deepEqual(Buffer.from(payload.file.base64, 'base64'), Buffer.from(bytes));
  assert.equal(payload.file.name, 'briefing.pdf');
  assert.equal(payload.message, 'Briefing');
  h.ctx.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200,
    getContentText: () => '{"success":true}' });
  assert.throws(() => h.ctx.sendToDiscordAPI('123', 'Briefing', blob), /attachment/);
  h.ctx.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200,
    getContentText: () => '{"error":"Send failed"}' });
  assert.throws(() => h.ctx.sendToDiscordAPI('123', 'Briefing', blob), /delivery/);
});
