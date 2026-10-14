const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
const server = read('index.js');
const drive = read('googleDrive.js');
const page = read('public/public/cbs.html');
function functionSource(source, name) {
  const match = source.match(new RegExp(`^( *)(?:async )?function ${name}\\([^]*?\\n\\1\\}`, 'm'));
  assert.ok(match, name);
  return match[0];
}

function harness() {
  let handler;
  let saved;
  let record = { rowNumber:31, caseType:'DPR', status:'Open', email:'passenger@example.com', updateHistory:'[]' };
  const sent = [];
  const discord = [];
  const context = vm.createContext({
    console,
    app:{ post:(_path, fn) => { handler = fn; } },
    sanitizeSheetText:(value, max) => String(value || '').trim().slice(0, max),
    sanitizeSheetMultilineText:(value, max) => String(value || '').trim().slice(0, max),
    cbsRecordMatchesId:(row, id) => String(row.rowNumber) === String(id),
    cbsValuesFromRecord:(row) => { saved = row; return [row.worldTracerFileNumber, row.status, row.updateHistory]; },
    getCbsCases:async () => [record],
    getCbsSheetTitle:async () => 'Cases', escapeSheetTitle:(value) => value,
    CBS_SHEET_ID:'test-sheet', cbsSheetCache:{ loadedAt:123 },
    sheets:{ spreadsheets:{ values:{ update:async () => { record = { ...saved }; } } } },
    worldTracerUpdateEmail:() => ({ subject:'Case confirmation', html:'Confirmation' }),
    sendCbsCaseEmail:async (message) => { sent.push(message); return { sent:true }; },
    sendDprWorldTracerUpdateToDiscord:async (...args) => { discord.push(args); return { sent:true }; },
    cbsEmailErrorMessage:(error) => error.message
  });
  for (const name of ['sanitizeCbsText', 'buildCbsUpdateFields']) vm.runInContext(functionSource(server, name), context);
  for (const name of ['sanitizeCbsUpdateEvent', 'parseCbsUpdateHistory', 'stringifyCbsUpdateHistory', 'cbsEventsFromUpdateNote', 'updateCbsCase']) vm.runInContext(functionSource(drive, name), context);
  const start = server.indexOf("app.post('/cbs-cases/:rowNumber/update'");
  vm.runInContext(server.slice(start, server.indexOf('\n});', start) + 4), context);
  const response = { statusCode:200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { handler, response, sent, discord, context, read:() => record };
}

test('DPR internal WorldTracer saves the reference and closes the case without passenger email', async () => {
  const h = harness();
  await h.handler({ params:{ rowNumber:31 }, body:{ type:'worldtracer_internal', fileNumber:' laxmu12345 ', updatedBy:'Test Agent' } }, h.response);
  assert.equal(h.response.statusCode, 200);
  assert.equal(h.response.body.updated, true);
  assert.equal(h.sent.length, 0);
  assert.equal(h.response.body.email, undefined);
  assert.equal(h.response.body.emailError, undefined);
  assert.equal(h.discord.length, 1);
  assert.equal(h.discord[0][1], 'LAXMU12345');
  const saved = h.read();
  assert.equal(saved.worldTracerFileNumber, 'LAXMU12345');
  assert.equal(saved.status, 'Closed - WorldTracer');
  const event = JSON.parse(saved.updateHistory).at(-1);
  assert.equal(event.key, 'worldtracer');
  assert.equal(event.title, 'WorldTracer - Internal');
  assert.equal(event.by, 'Test Agent');
  assert.equal(new Map(event.fields).get('Passenger Email'), 'Not sent (internal update)');
});

test('ordinary DPR WorldTracer still emails the passenger and closes the case', async () => {
  const h = harness();
  await h.handler({ params:{ rowNumber:31 }, body:{ type:'worldtracer', fileNumber:'LAXMU12345', skipPassengerEmail:true } }, h.response);
  assert.equal(h.response.statusCode, 200);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].passengerEmail, 'passenger@example.com');
  assert.equal(h.discord.length, 1);
  assert.equal(h.read().status, 'Closed - WorldTracer');
});

test('internal WorldTracer requires a file number before writing or notifying', async () => {
  const h = harness();
  await h.handler({ params:{ rowNumber:31 }, body:{ type:'worldtracer_internal', fileNumber:' ' } }, h.response);
  assert.equal(h.response.statusCode, 400);
  assert.equal(h.read().status, 'Open');
  assert.equal(h.sent.length, 0);
  assert.equal(h.discord.length, 0);
});

test('DPR picker offers the internal option with the same required file field', () => {
  const context = vm.createContext({ escapeHtml:(value) => value });
  vm.runInContext(functionSource(page, 'inlineUpdateFieldsHtml'), context);
  const fields = context.inlineUpdateFieldsHtml('worldtracer_internal');
  assert.equal(fields, context.inlineUpdateFieldsHtml('worldtracer'));
  assert.match(fields, /name="fileNumber"[^>]*required/);
  assert.match(page, /if \(isDpr\) updateKeys\.splice\([^\n]*key:'worldtracer_internal', text:'WorldTracer - Internal'/);
  assert.match(functionSource(page, 'trackingControlHtml'), /event\.title === 'WorldTracer - Internal' \? event\.title/);
});
