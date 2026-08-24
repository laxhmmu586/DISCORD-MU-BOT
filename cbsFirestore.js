const crypto = require('crypto');
const { google } = require('googleapis');

const projectId = String(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'china-eastern').trim();
const databaseId = String(process.env.FIRESTORE_DATABASE_ID || 'laxmufc').trim();
const enabled = String(process.env.CBS_FIRESTORE_ENABLED || 'true').toLowerCase() !== 'false';
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/datastore']
});

const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
// Firestore rejects an array that directly contains another array. CBS update
// events intentionally use two-dimensional arrays for label/value fields, so
// wrap nested arrays in a map while encoding and transparently unwrap them on
// reads.
const nestedArrayKey = '__cbsNestedArray';

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, clean(item)]));
  return value === undefined ? null : value;
}

function encodeValue(value, insideArray = false) {
  if (value === null || value === undefined) return { nullValue:null };
  if (typeof value === 'boolean') return { booleanValue:value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue:String(value) } : { doubleValue:value };
  if (typeof value === 'string') return { stringValue:value };
  if (Array.isArray(value)) {
    const encoded = { arrayValue:{ values:value.map((item) => encodeValue(item, true)) } };
    return insideArray ? { mapValue:{ fields:{ [nestedArrayKey]:encoded } } } : encoded;
  }
  return { mapValue:{ fields:encodeFields(value) } };
}

function encodeFields(value = {}) {
  return Object.fromEntries(Object.entries(clean(value)).map(([key, item]) => [key, encodeValue(item)]));
}

function decodeValue(value = {}) {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {};
    if (Object.keys(fields).length === 1 && fields[nestedArrayKey]?.arrayValue) return decodeValue(fields[nestedArrayKey]);
    return decodeFields(fields);
  }
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function documentId(record = {}) {
  if (record.firestoreId) return String(record.firestoreId);
  if (record.rowNumber) return `legacy-${record.rowNumber}`;
  const identity = [record.worldTracerFileNumber, record.bagTag, record.originalTagNumber, record.submittedAt, record.createdAt].filter(Boolean).join('|');
  return crypto.createHash('sha256').update(identity || JSON.stringify(clean(record))).digest('hex').slice(0, 32);
}

async function request(method, url, data) {
  const client = await auth.getClient();
  const response = await client.request({ method, url, data });
  return response.data;
}

async function list(collection) {
  if (!enabled) return null;
  const rows = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize:'300' });
    if (pageToken) query.set('pageToken', pageToken);
    const data = await request('GET', `${baseUrl}/${encodeURIComponent(collection)}?${query}`);
    for (const document of data.documents || []) rows.push({ ...decodeFields(document.fields), firestoreId:document.name.split('/').pop() });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return rows;
}

async function get(collection, id) {
  if (!enabled) return null;
  try {
    const document = await request('GET', `${baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
    return { ...decodeFields(document.fields), firestoreId:id };
  } catch (error) {
    if (Number(error?.response?.status) === 404 || Number(error?.code) === 404) return null;
    throw error;
  }
}

async function upsert(collection, record) {
  if (!enabled || !record) return record;
  const id = documentId(record);
  await request('PATCH', `${baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
    fields:encodeFields({ ...record, firestoreId:id, firestoreUpdatedAt:new Date().toISOString() })
  });
  return { ...record, firestoreId:id };
}

function dedupeRecords(records = []) {
  const unique = new Map();
  for (const record of records) unique.set(documentId(record), record);
  return [...unique.values()];
}

async function upsertMany(collection, records = []) {
  if (!enabled || !records.length) return records;
  // Firestore batchWrite rejects a request when two writes target the same
  // document. Legacy sheets can contain duplicate logical rows, so collapse
  // them before batching and keep the last copy as the current value.
  const uniqueRecords = dedupeRecords(records);
  for (let index = 0; index < uniqueRecords.length; index += 400) {
    const writes = uniqueRecords.slice(index, index + 400).map((record) => {
      const id = documentId(record);
      return { update:{
        name:`projects/${projectId}/databases/${databaseId}/documents/${collection}/${id}`,
        fields:encodeFields({ ...record, firestoreId:id, firestoreUpdatedAt:new Date().toISOString() })
      } };
    });
    await request('POST', `${baseUrl}:batchWrite`, { writes });
  }
  return records.map((record) => ({ ...record, firestoreId:documentId(record) }));
}

module.exports = { enabled, projectId, databaseId, list, get, upsert, upsertMany, _test:{ encodeValue, decodeValue, documentId, dedupeRecords } };
