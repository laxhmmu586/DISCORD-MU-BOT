'use strict';
// Privileged code: shipped only through a Core release, never through a hotfix.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const FILE = /^(?!.*(?:^|\/)(?:\.{1,2}|CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|\/|$))[a-zA-Z0-9_@-]+(?:[a-zA-Z0-9_@.\/-]*[a-zA-Z0-9_-])?\.(?:html|css|js|json|svg|png|jpe?g|webp|ico|woff2?|ttf|pdf)$/i;
function assert(ok, message) { if (!ok) throw Error(message); }
function safeFile(name) {
  assert(typeof name === 'string' && FILE.test(name) && !name.includes('//') && !name.includes('..') && !name.split('/').some(part=>part.endsWith('.')), 'Unsafe hotfix path');
  assert(!/^(?:desktop-|flight-session\.js|assets\/firebase\/)/i.test(name), 'Core-owned asset');
  return name;
}
function sourceURL(source) {
  const url = new URL(source);
  assert(!url.username && !url.password && !url.search && !url.hash, 'Invalid update source');
  // HTTP is only allowed for explicitly configured private LAN mirrors. Signatures
  // remain mandatory; a mirror cannot supply keys or redirect to another source.
  const lan = /^(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
  assert(url.protocol === 'https:' || (url.protocol === 'http:' && lan), 'HTTPS or private LAN required');
  return new URL(url.href.replace(/\/?$/, '/'));
}
async function atomic(file, value) {
  const temp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  const handle = await fs.open(temp, 'wx');
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  try {await renameAtomic(temp,file);} catch(error){await fs.unlink(temp).catch(()=>{});throw error;}
}
async function renameAtomic(source,target) {
  // Windows antivirus/indexing may briefly open a destination without delete
  // sharing. Retry replacement; never unlink the last known good pointer.
  for(let attempt=0;;attempt++) {
    try{return await fs.rename(source,target);}catch(error){
      if(attempt>=6||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;
      await new Promise(resolve=>setTimeout(resolve,25*2**attempt));
    }
  }
}
async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function treeHash(root) {
  const entries = [];
  async function walk(directory, prefix = '') {
    for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
      const name = prefix + item.name, file = path.join(directory, item.name);
      assert(!item.isSymbolicLink(), 'Symlink in UI tree');
      if (item.isDirectory()) await walk(file, name + '/');
      else { assert(item.isFile(), 'Unsupported UI file'); entries.push([name,digest(await fs.readFile(file))]); }
    }
  }
  await walk(root); return digest(JSON.stringify(entries));
}
async function copyTree(source,target) {
  // Electron's virtual ASAR filesystem supports readdir/readFile. Native cp
  // fast paths do not consistently understand directories inside app.asar.
  await fs.mkdir(target,{recursive:true});
  for(const item of await fs.readdir(source,{withFileTypes:true})) {
    assert(!item.isSymbolicLink(),'Symlink in UI tree');
    if(item.isDirectory())await copyTree(path.join(source,item.name),path.join(target,item.name));
    else {assert(item.isFile(),'Unsupported UI file');await fs.writeFile(path.join(target,item.name),await fs.readFile(path.join(source,item.name)));}
  }
}
class Updater {
  constructor({directory, bundledRoot, coreVersion, config, fetch = global.fetch, now = Date.now}) {
    Object.assign(this, {directory, bundledRoot, coreVersion, config, fetch, now});
    this.status = {status:'disabled',message:'Secure update publishing is not configured.'};
  }
  async init() {
    await fs.mkdir(this.directory, {recursive:true});
    this.stateFile = path.join(this.directory, 'state.json');
    this.state = await readJSON(this.stateFile, {active:null,previous:null,sequence:0,blocked:[]});
    this.baseline = await treeHash(this.bundledRoot);
    this.rollbackRequested = Boolean(this.state.disabled && this.state.active || this.state.blocked.includes(this.state.active));
    // An interrupted activation never becomes trusted simply because MUFC restarted.
    if (this.state.pending) await this.rollback('Interrupted update activation');
    if (this.state.active) {
      try { await this.verifyInstalled(this.state.active); } catch { await this.rollback('Installed UI verification failed'); }
    }
    this.sources = (this.config.sources || []).map(sourceURL);
    this.enabled = Object.keys(this.config.keys || {}).length > 0 && this.sources.length > 0;
    if (this.enabled) this.status = {status:'ready',message:'Secure updates ready.'};
    return this;
  }
  async persist() { this.writes=(this.writes||Promise.resolve()).catch(()=>{}).then(()=>atomic(this.stateFile,this.state));await this.writes; }
  root(id = this.state.active) { return id ? path.join(this.directory, 'releases', id, 'web') : this.bundledRoot; }
  async bytes(url, limit) {
    const response = await this.fetch(url.href, {redirect:'error',signal:AbortSignal.timeout(20000),cache:'no-store'});
    assert(response.ok, 'Update source HTTP ' + response.status);
    assert(Number(response.headers.get('content-length') || 0) <= limit, 'Update too large');
    const chunks = []; let size = 0;
    if (!response.body) return Buffer.alloc(0);
    try { for await (const chunk of response.body) { size += chunk.length; assert(size <= limit, 'Update too large'); chunks.push(Buffer.from(chunk)); } }
    catch (error) { await response.body.cancel?.().catch(()=>{}); throw error; }
    return Buffer.concat(chunks);
  }
  async downloadCore(url,file,release) {
    const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';let handle;
    try {
      const response=await this.fetch(url.href,{redirect:'error',signal:AbortSignal.timeout(10*60000),cache:'no-store'});
      assert(response.ok,'Core source HTTP '+response.status);
      assert(Number(response.headers.get('content-length')||0)<=release.size,'Core too large');
      handle=await fs.open(temp,'wx');const hash=crypto.createHash('sha256');let size=0;
      assert(response.body,'Missing Core body');
      for await(const chunk of response.body){size+=chunk.length;assert(size<=release.size,'Core too large');hash.update(chunk);await handle.writeFile(chunk);}
      assert(size===release.size&&hash.digest('hex')===release.sha256,'Core checksum failed');
      await handle.sync();await handle.close();handle=null;await renameAtomic(temp,file);
    }finally{if(handle)await handle.close();await fs.unlink(temp).catch(()=>{});}
  }
  verifyEnvelope(envelope, {expiry = true} = {}) {
    assert(envelope && typeof envelope.payload === 'string' && envelope.payload.length < 2e6, 'Invalid signed envelope');
    const key = this.config.keys?.[envelope.keyId]; assert(key, 'Unknown signing key');
    assert(crypto.createPublicKey(key).asymmetricKeyType === 'ed25519', 'Ed25519 key required');
    const bytes = Buffer.from(envelope.payload, 'base64');
    assert(crypto.verify(null, bytes, key, Buffer.from(envelope.signature || '', 'base64')), 'Invalid update signature');
    const manifest = JSON.parse(bytes);
    assert(manifest.schema === 1 && manifest.channel === this.config.channel, 'Wrong update channel');
    assert(Number.isSafeInteger(manifest.sequence) && manifest.sequence > 0, 'Invalid release sequence');
    assert(manifest.coreVersion === this.coreVersion && manifest.baseline === this.baseline, 'Core compatibility mismatch');
    assert(Number.isSafeInteger(manifest.issuedAt) && manifest.issuedAt <= this.now() + 60000, 'Future manifest');
    assert(Number.isSafeInteger(manifest.expiresAt) && manifest.expiresAt > manifest.issuedAt && manifest.expiresAt - manifest.issuedAt <= 7*86400000, 'Invalid manifest validity');
    if (expiry) assert(manifest.expiresAt > this.now(), 'Expired manifest');
    assert(Array.isArray(manifest.revoked) && manifest.revoked.every(id => ID.test(id)), 'Invalid revocation list');
    assert(typeof manifest.paused === 'boolean' && typeof manifest.disabled === 'boolean', 'Missing publication controls');
    if (manifest.hotfix) {
      const h = manifest.hotfix;
      assert(ID.test(h.id) && Array.isArray(h.files) && h.files.length > 0 && h.files.length <= 3000, 'Invalid hotfix');
      let total = 0; const names = new Set();
      for (const file of h.files) {
        safeFile(file.path); const canonical = file.path.toLowerCase();
        assert(!names.has(canonical), 'Duplicate hotfix path'); names.add(canonical);
        assert(/^[a-f0-9]{64}$/.test(file.sha256) && Number.isSafeInteger(file.size) && file.size > 0 && file.size <= 20e6, 'Invalid file integrity');
        total += file.size;
      }
      assert(total <= 100e6, 'Hotfix too large');
    }
    if (manifest.core) {
      const c = manifest.core;
      assert(ID.test(c.id) && /^[a-zA-Z0-9._-]+\.exe$/.test(c.file) && /^[a-f0-9]{64}$/.test(c.sha256), 'Invalid Core release');
      assert(Number.isSafeInteger(c.size) && c.size > 0 && c.size <= 600e6 && c.version !== this.coreVersion, 'Invalid Core size/version');
    }
    return manifest;
  }
  async verifyInstalled(id) {
    assert(ID.test(id), 'Invalid installed version');
    const directory = path.join(this.directory, 'releases', id);
    const receipt = await readJSON(path.join(directory,'receipt.json'));
    const manifest = this.verifyEnvelope(receipt.envelope, {expiry:false});
    assert(manifest.hotfix?.id === id && !this.state.blocked.includes(id), 'Revoked UI');
    assert(receipt.tree === await treeHash(path.join(directory,'web')), 'Installed UI modified');
    // The complete tree digest is derived again from the bundled base and signed
    // patch; the unsigned receipt alone cannot authorize extra executable files.
    const expected = await this.expectedTree(manifest.hotfix.files);
    assert(expected === receipt.tree, 'Untrusted UI tree');
    return manifest;
  }
  async expectedTree(files) {
    const entries = [];
    const patches = new Map(files.map(f => [f.path,f.sha256]));
    const walk = async (dir,prefix='') => {
      for(const item of await fs.readdir(dir,{withFileTypes:true})) {
        const name=prefix+item.name;
        if(item.isDirectory()) await walk(path.join(dir,item.name),name+'/');
        else { entries.push([name,patches.get(name)||digest(await fs.readFile(path.join(dir,item.name)))]);patches.delete(name); }
      }
    };
    await walk(this.bundledRoot);entries.push(...patches);entries.sort((a,b)=>a[0].localeCompare(b[0],'en'));
    // treeHash uses directory traversal order, which differs from global order
    // when a directory name shares a prefix with a filename. Use the same order.
    const compare = (a,b) => {const x=a[0].split('/'),y=b[0].split('/');for(let i=0;i<Math.min(x.length,y.length);i++){const c=x[i].localeCompare(y[i],'en');if(c)return c;}return x.length-y.length;};
    entries.sort(compare);return digest(JSON.stringify(entries));
  }
  async check() {
    if (!this.enabled || this.checking || this.activating) return this.status;
    this.checking = true;
    try {
      assert(!await readJSON(path.join(this.directory,'disable-updates.json'),null), 'Updates disabled by local administrator');
      let accepted;
      for (const source of this.sources) {
        try {
          const envelope = JSON.parse((await this.bytes(new URL('manifest.json',source),2e6)).toString());
          const manifest = this.verifyEnvelope(envelope);
          assert(manifest.sequence >= this.state.sequence, 'Replayed manifest');
          const hash = digest(envelope.payload);
          if (manifest.sequence === this.state.sequence) assert(hash === this.state.manifestHash, 'Conflicting manifest sequence');
          accepted = {source,envelope,manifest,hash}; break;
        } catch (error) { this.lastError = error.message; }
      }
      assert(accepted, this.lastError || 'No trusted update source');
      const {source,envelope,manifest,hash} = accepted;
      this.ready=null;this.coreReady=null;
      this.state.sequence = manifest.sequence;this.state.manifestHash = hash;
      this.state.blocked = [...new Set([...this.state.blocked,...manifest.revoked])];
      this.control = manifest;
      this.state.disabled = manifest.disabled;
      if (manifest.disabled && this.state.active || this.state.blocked.includes(this.state.active)) this.rollbackRequested = true;
      if (manifest.paused || manifest.disabled) { this.ready = null; this.coreReady = null; }
      await this.persist();
      if (!manifest.paused && !manifest.disabled && manifest.hotfix && manifest.hotfix.id !== this.state.active && !this.state.blocked.includes(manifest.hotfix.id)) {
        const h = manifest.hotfix, directory = path.join(this.directory,'releases',h.id);
        try { const installed=await this.verifyInstalled(h.id);assert(JSON.stringify(installed.hotfix.files)===JSON.stringify(h.files),'Release ID reused'); }
        catch {
          const stage = path.join(this.directory,'stage-'+crypto.randomBytes(12).toString('hex'));
          try {
            await copyTree(this.bundledRoot,path.join(stage,'web'));
            for (const file of h.files) {
              const bytes = await this.bytes(new URL('files/'+file.sha256,source),file.size);
              assert(bytes.length === file.size && digest(bytes) === file.sha256, 'Hotfix checksum failed');
              const target = path.join(stage,'web',file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
            }
            const tree = await treeHash(path.join(stage,'web'));assert(tree === await this.expectedTree(h.files),'Staged tree mismatch');
            await atomic(path.join(stage,'receipt.json'),{envelope,tree});
            await fs.mkdir(path.dirname(directory),{recursive:true});
            // Never modify a live release or reuse a release ID for other bytes.
            try { await renameAtomic(stage,directory); } catch(error) { if(!['EEXIST','ENOTEMPTY','EPERM'].includes(error.code))throw error;const installed=await this.verifyInstalled(h.id);assert(JSON.stringify(installed.hotfix.files)===JSON.stringify(h.files),'Release ID reused'); }
          } finally { await fs.rm(stage,{recursive:true,force:true}); }
        }
        this.ready = h.id;
      }
      if (!manifest.paused && !manifest.disabled && manifest.core && !this.state.blocked.includes(manifest.core.id)) {
        const c=manifest.core; const file=path.join(this.directory,'core-'+c.id+'.exe');
        let bytes;try{bytes=await fs.readFile(file);}catch{}
        if(!bytes||digest(bytes)!==c.sha256)await this.downloadCore(new URL('files/'+c.sha256,source),file,c);
        // Installation additionally requires Windows Authenticode with a pinned
        // publisher certificate. No shell arguments are supplied by the feed.
        this.coreReady={file,release:c,envelope};
      }
      this.status = {status:this.ready?'staged':'checked',message:this.ready?'Verified hotfix downloaded; waiting for a safe moment.':manifest.paused?'Update publishing paused.':manifest.disabled?'Updates disabled by publisher.':this.coreReady?'更新已下载。请在更新弹窗中点击“立即安装”。':'已是最新版本。',hotfix:this.ready,core:Boolean(this.coreReady),coreVersion:this.coreReady?.release.version};
    } catch(error) { this.ready=null;this.coreReady=null;this.status={status:'error',message:error.message}; }
    finally { this.checking=false; }
    return this.status;
  }
  async activate(stillSafe = () => true) {
    this.activating=true;
    const previousState={...this.state,blocked:[...this.state.blocked]},candidate=this.ready;
    try {
    assert(this.ready && !this.state.pending && !this.checking, 'No hotfix ready');
    assert(this.control && this.control.expiresAt > this.now() && !this.control.paused && !this.control.disabled, 'Publication not active');
    assert(!await readJSON(path.join(this.directory,'disable-updates.json'),null),'Updates disabled locally');
    await this.verifyInstalled(this.ready);
    assert(stillSafe(), 'Page changed while preparing hotfix');
    this.state.previous=this.state.active;this.state.active=this.ready;this.state.pending=true;this.ready=null;
    try {await this.persist();} catch(error) {this.state=previousState;this.ready=candidate;throw error;}
    return this.root();
    } finally {this.activating=false;}
  }
  async healthy() { if(this.state.pending){this.state.pending=false;try{await this.persist();}catch(error){this.state.pending=true;throw error;}} }
  async rollback(reason) {
    const failed=this.state.active;
    if(failed)this.state.blocked=[...new Set([...(this.state.blocked||[]),failed])];
    this.state.active=this.state.previous||null;this.state.previous=null;this.state.pending=false;
    if(this.state.active){try{await this.verifyInstalled(this.state.active);}catch{this.state.active=null;}}
    this.rollbackRequested=false;await this.persist();this.status={status:'rolled-back',message:reason};return this.root();
  }
}
module.exports={Updater,digest,atomic,treeHash,safeFile,sourceURL};
