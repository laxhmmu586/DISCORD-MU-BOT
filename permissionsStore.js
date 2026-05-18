const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, 'permissions-overrides.json');

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getPermissionsForUid(uid) {
  const store = readStore();
  return store[uid] || null;
}

function setPermissionsForUid(uid, permissions) {
  const store = readStore();
  store[uid] = permissions;
  writeStore(store);
}

module.exports = {
  getPermissionsForUid,
  setPermissionsForUid
};
