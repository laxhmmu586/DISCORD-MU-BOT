const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('bridge progress is scoped by flight, operation and bridge and completed takes priority',()=>{const source=fs.readFileSync(require.resolve('../public/public/has-pbb-client.js'),'utf8'),start=source.indexOf(' const opsArrivalLocked='),end=source.indexOf(' function movementIcon',start),context=vm.createContext({context:{employee:{station:'LAX'},flightSchedule:[]},contextRecords:[],draft:{flightNo:'MU586'},operation:'departure',bridge:'L1',role:'driver'});vm.runInContext(source.slice(start,end)+';globalThis.tile=bridgeChoice;',context);const r={flightNo:'MU586',bridge:'L1',type:'departure',owners:{driver:'fictional'}};context.contextRecords=[r];assert.match(context.tile('L1'),/In Progress/);context.role='spotter';assert.doesNotMatch(context.tile('L1'),/In Progress/);context.role='driver';assert.doesNotMatch(context.tile('L2'),/In Progress/);context.operation='arrival';assert.doesNotMatch(context.tile('L1'),/In Progress/);context.operation='departure';context.contextRecords=[{...r,completedAt:'2026-10-22',signatures:{driver:{},spotter:{}}}];assert.match(context.tile('L1'),/Completed/);assert.doesNotMatch(context.tile('L1'),/In Progress/);context.contextRecords=[{...r,owners:{}}];assert.doesNotMatch(context.tile('L1'),/In Progress/);});

test('flight choices include both legs and selection synchronizes operation and paired flight',()=>{
 const source=fs.readFileSync(require.resolve('../public/public/has-pbb-client.js'),'utf8'),start=source.indexOf(' const flightChoices='),end=source.indexOf(' function acceptGateState',start);
 const context=vm.createContext({context:{flightSchedule:[{inbound:{flightNo:'MU583'},outbound:{flightNo:'MU586'}},{inbound:{flightNo:'MU577'},outbound:{flightNo:'MU578'}}],gateLocks:[{flightNo:'MU586',gate:'156',expiresAt:'2099-01-01'}]},draft:{flightNo:'',gate:''},operation:'arrival',stage:'gate',serverOffset:0});
 vm.runInContext(source.slice(start,end)+';globalThis.choices=flightChoices;globalThis.select=selectFlight;globalThis.switchTo=selectOperation;',context);
 assert.deepEqual(Array.from(context.choices()),['MU577','MU578','MU583','MU586']);
 context.select('MU586');assert.equal(context.operation,'departure');assert.equal(context.draft.gate,'156');assert.equal(context.stage,'bridge');
 context.switchTo('arrival');assert.equal(context.draft.flightNo,'MU583');assert.equal(context.operation,'arrival');assert.equal(context.draft.gate,'');assert.equal(context.stage,'gate');
 context.switchTo('departure');assert.equal(context.draft.flightNo,'MU586');assert.equal(context.draft.gate,'156');
 context.select('MU577');assert.equal(context.operation,'arrival');context.switchTo('departure');assert.equal(context.draft.flightNo,'MU578');
 context.context.flightSchedule=[];context.context.defaultFlights=['MU999'];context.select('MU999');context.switchTo('arrival');assert.equal(context.draft.flightNo,'MU999');assert.equal(context.operation,'arrival');
});

test('configured arrival Spotter tiles complete and lock all bridges and resets without records, while Driver remains usable',()=>{
 const source=fs.readFileSync(require.resolve('../public/public/has-pbb-client.js'),'utf8'),start=source.indexOf(' const opsArrivalLocked='),end=source.indexOf(' function movementIcon',start);
 const ctx=vm.createContext({context:{employee:{station:'LAX'},flightSchedule:[{opsArrivalSpotter:true,inbound:{flightNo:'MU583'}}]},contextRecords:[],draft:{flightNo:'MU583'},operation:'arrival',bridge:'',role:'spotter'});
 vm.runInContext(source.slice(start,end)+';globalThis.tile=bridgeChoice;',ctx);
 for(const b of ['L1','L2','L3']){const tile=ctx.tile(b);assert.match(tile,/is-complete/);assert.match(tile,/Completed · Locked/);assert.match(tile,/has-bridge-lock/);assert.match(tile,/data-bridge="L[123]" disabled/);assert.match(tile,/data-reset-bridge="L[123]" disabled/);}
 ctx.role='driver';assert.doesNotMatch(ctx.tile('L1'),/disabled|is-complete|has-bridge-lock/);
 ctx.role='spotter';ctx.operation='departure';assert.doesNotMatch(ctx.tile('L1'),/disabled|is-complete/);
 ctx.operation='arrival';ctx.draft.flightNo='MU999';assert.doesNotMatch(ctx.tile('L1'),/disabled|is-complete/);
 ctx.draft.flightNo='MU583';ctx.context.employee.station='SFO';assert.doesNotMatch(ctx.tile('L1'),/disabled|is-complete/);
});
