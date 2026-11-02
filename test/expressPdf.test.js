const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {PDFDocument}=require('../vendor/pdf-lib/pdf-lib'),pdf=require('../has/server/expressPdf');
test('original Express assets match their recorded hashes and form stays one original-sized page',async()=>{
 const manifest=require('../has/resources/express/template.json');
 for(const [file,key] of [['express-connect-source.docx','sourceSha256'],['express-connect-blank.pdf','blankPdfSha256']])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../has/resources/express/'+file))).digest('hex'),manifest[key]);
 const doc=await PDFDocument.load(await pdf.form({eta:{form:'0110PM'},count:12}));assert.equal(doc.getPageCount(),1);assert.deepEqual(doc.getPage(0).getSize(),{width:612,height:792});
});
test('batch posters have one landscape A4 page per person and request single-sided printing',async()=>{
 const doc=await PDFDocument.load(await pdf.posters([{name:'JOHN SMITH',destination:'DL555/JFK',seat:'52A',flight:'MU583'},{name:'JANE DOE',destination:'UA123/LAX',seat:'12A',flight:'MU583'}]));
 assert.equal(doc.getPageCount(),2);for(const page of doc.getPages())assert.deepEqual(page.getSize(),{width:841.8898,height:595.2756});assert.equal(doc.catalog.getOrCreateViewerPreferences().getDuplex(),'Simplex');
});
test('Gmail transport fixes CBP recipient and attaches the supplied preview bytes',async()=>{
 const source=fs.readFileSync(require.resolve('../googleDrive'),'utf8').split('module.exports.sendExpressConnectionEmail=')[1];assert(source);let request,mail;
 const context={module:{exports:{}},require:()=>({RECIPIENT:'lax-watch-cmdr@cbp.dhs.gov'}),getNextDayInfoGmailClient:()=>({gmail:{users:{messages:{send:async value=>{request=value;return {data:{id:'mock-only'}};}}}},userId:'me'}),buildRawCbsEmail:value=>{mail=value;return 'raw-preview';},base64UrlEncode:value=>'encoded:'+value};
 vm.runInNewContext('module.exports.send='+source,context);const bytes=Buffer.from('%PDF-exact-preview');const result=await context.module.exports.send({recipient:'wrong@example.com',subject:'EXPRESS PASS APPLY',text:'Dear Officer:\nPAX: 2',pdfBuffer:bytes,filename:'preview.pdf'});
 assert.equal(result.id,'mock-only');assert.equal(mail.to,'lax-watch-cmdr@cbp.dhs.gov');assert.strictEqual(mail.pdfBuffer,bytes);assert.equal(mail.filename,'preview.pdf');assert.match(mail.html,/<strong>Dear Officer:/);assert.equal(request.requestBody.raw,'encoded:raw-preview');
});
