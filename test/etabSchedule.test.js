const {test}=require('node:test'),assert=require('node:assert/strict');
const {createScheduleReader,SPREADSHEET_ID,SHEET_ID}=require('../etabSchedule');
test('schedule uses existing Drive OAuth, fixed gid and numeric dates with one metadata read',async()=>{
 let credentials,metadataReads=0,valueReads=0;
 const google={auth:{OAuth2:class{setCredentials(c){credentials=c;}},GoogleAuth:class{constructor(){throw Error('Must use existing Drive account');}}},sheets:()=>({spreadsheets:{get:async args=>{metadataReads++;assert.equal(args.spreadsheetId,SPREADSHEET_ID);return {data:{sheets:[{properties:{sheetId:1,title:'Wrong tab'}},{properties:{sheetId:SHEET_ID,title:"Live Schedule"}}]}};},values:{get:async(args,options)=>{valueReads++;assert.equal(args.range,"'Live Schedule'!A1:ZZ1000");assert.equal(args.dateTimeRenderOption,'SERIAL_NUMBER');assert.equal(options.timeout,15000);return {data:{values:[['fixture']]}};}}}})};
 const read=createScheduleReader({google,env:{PBB_DRIVE_REFRESH_TOKEN:'test-token'}});
 assert.deepEqual(await read(),[['fixture']]);await read();assert.deepEqual(credentials,{refresh_token:'test-token'});assert.equal(metadataReads,1);assert.equal(valueReads,2);
});
