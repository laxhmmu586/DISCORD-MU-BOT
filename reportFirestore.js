const crypto = require('crypto');
const firestore = require('./cbsFirestore');

const COLLECTION_PREFIX = String(process.env.REPORT_FIRESTORE_COLLECTION_PREFIX || 'reportCenter').trim();

function normalizeType(type) {
  const normalized = String(type || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'psmmsg') return 'psmMsg';
  if (normalized === 'salesdetail' || normalized === 'salesdetails') return 'salesDetails';
  if (normalized === 'wch') return 'wheelchair';
  return normalized;
}

function collectionName(type) {
  return `${COLLECTION_PREFIX}_${normalizeType(type)}`;
}

function rowId(type, row = {}) {
  const identity = String(row.key || [
    normalizeType(type), row.date, row.flightDate, row.flightNo, row.passenger,
    row.bn, row.seat, row.emd, row.type, row.detail
  ].filter(Boolean).join('|')).trim().toUpperCase();
  return crypto.createHash('sha256').update(identity || JSON.stringify(row)).digest('hex').slice(0, 40);
}

function prepare(type, row) {
  return { ...row, reportType:normalizeType(type), firestoreId:rowId(type, row) };
}

async function load(type, legacyLoader) {
  const normalized = normalizeType(type);
  // Report collections have already been migrated. Read Firestore directly;
  // retain the legacy loader only for explicit Firestore-disabled rollback.
  const rows = firestore.enabled
    ? await firestore.list(collectionName(normalized))
    : (await legacyLoader() || []).map((row) => prepare(normalized, row));
  return (rows || []).filter((row) => row.reportType === normalized);
}

async function upsertMany(type, rows = []) {
  const prepared = rows.map((row) => prepare(type, row));
  await firestore.upsertMany(collectionName(type), prepared);
  return prepared;
}

module.exports = { enabled:firestore.enabled, normalizeType, collectionName, rowId, load, upsertMany };
