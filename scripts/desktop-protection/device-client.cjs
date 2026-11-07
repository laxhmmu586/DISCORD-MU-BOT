const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
async function createDeviceClient(directory,safeStorage,nativeFetch=global.fetch) {
  fs.mkdirSync(directory,{recursive:true});
  const filename=path.join(directory,'desktop-device-key.bin');
  if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential protection is unavailable.');
  let pem;
  if(fs.existsSync(filename))pem=safeStorage.decryptString(fs.readFileSync(filename));
  else {
    const pair=crypto.generateKeyPairSync('ed25519');
    pem=pair.privateKey.export({type:'pkcs8',format:'pem'});
    fs.writeFileSync(filename,safeStorage.encryptString(pem),{flag:'wx'});
  }
  const privateKey=crypto.createPrivateKey(pem),publicKey=crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'});
  const id=crypto.createHash('sha256').update(publicKey).digest('hex');
  fs.writeFileSync(path.join(directory,'desktop-device-enrollment.json'),JSON.stringify({id,publicKey,computer:require('node:os').hostname()},null,2));
  const digest=v=>crypto.createHash('sha256').update(v||'').digest('hex');
  return async function deviceFetch(resource,options={}) {
    const url=new URL(resource instanceof Request?resource.url:resource);
    if(url.origin!=='https://api.mufcapp.net')return nativeFetch(resource,options);
    const method=(options.method||'GET').toUpperCase(),headers=new Headers(options.headers);
    let body=options.body;
    if(body&&typeof body[Symbol.asyncIterator]==='function'&&!Buffer.isBuffer(body)) {
      const chunks=[];for await(const chunk of body)chunks.push(Buffer.from(chunk));body=Buffer.concat(chunks);
    }
    const time=String(Date.now()),nonce=crypto.randomBytes(24).toString('base64url');
    const message=['MUFC-DESKTOP-1',method,url.pathname+url.search,time,nonce,digest(headers.get('Authorization')),digest(body)].join('\n');
    headers.set('X-MUFC-Device',id);headers.set('X-MUFC-Time',time);headers.set('X-MUFC-Nonce',nonce);
    headers.set('X-MUFC-Signature',crypto.sign(null,Buffer.from(message),privateKey).toString('base64url'));
    return nativeFetch(resource,{...options,headers,...(body?{body}:{})});
  };
}
module.exports={createDeviceClient};
