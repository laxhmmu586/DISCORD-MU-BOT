-- VISA rules and immutable official-source snapshots.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS visa_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visa_unknown_combinations (
  nationality TEXT NOT NULL,
  destination_country TEXT NOT NULL,
  passport_type TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK(status IN ('pending','covered')),
  PRIMARY KEY(nationality,destination_country,passport_type)
);
CREATE TABLE IF NOT EXISTS visa_sources (
  id TEXT PRIMARY KEY,
  authority TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  snapshot_path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL CHECK(review_status IN ('draft','approved','superseded')),
  reviewed_by TEXT,
  reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS visa_monitors (
  url TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('policy','feed')),
  authority TEXT NOT NULL,
  latest_source_id TEXT REFERENCES visa_sources(id),
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS visa_notices (
  url TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','reviewed')),
  reviewed_by TEXT,
  reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS visa_rules (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  nationality TEXT NOT NULL,
  destination_country TEXT NOT NULL,
  passport_type TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK(rule_type IN
    ('citizen_return','visa_exempt','twov_240','visa_document','residence_document','special_document')),
  conditions_json TEXT NOT NULL CHECK(json_valid(conditions_json)),
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  verified_at TEXT NOT NULL,
  recheck_due_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','approved','superseded')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  PRIMARY KEY(id, version),
  CHECK(effective_until IS NULL OR effective_until >= effective_from),
  CHECK(status != 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS visa_rules_lookup
  ON visa_rules(nationality,destination_country,passport_type,status,effective_from);
CREATE TABLE IF NOT EXISTS visa_rule_sources (
  rule_id TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  source_id TEXT NOT NULL REFERENCES visa_sources(id),
  clause_reference TEXT NOT NULL,
  PRIMARY KEY(rule_id,rule_version,source_id,clause_reference),
  FOREIGN KEY(rule_id,rule_version) REFERENCES visa_rules(id,version)
);
CREATE TABLE IF NOT EXISTS visa_coverage (
  nationality TEXT NOT NULL,
  destination_country TEXT NOT NULL,
  observed_count INTEGER NOT NULL,
  observation_from TEXT NOT NULL,
  observation_until TEXT NOT NULL,
  coverage_status TEXT NOT NULL CHECK(coverage_status IN ('planned','reviewed','enabled')),
  PRIMARY KEY(nationality,destination_country)
);
CREATE TABLE IF NOT EXISTS visa_decisions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  operation_date TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  rule_versions_json TEXT NOT NULL CHECK(json_valid(rule_versions_json)),
  status TEXT NOT NULL CHECK(status IN ('pass','review','fail')),
  reason_codes_json TEXT NOT NULL CHECK(json_valid(reason_codes_json)),
  missing_fields_json TEXT NOT NULL CHECK(json_valid(missing_fields_json)),
  source_ids_json TEXT NOT NULL CHECK(json_valid(source_ids_json)),
  manual_override_json TEXT CHECK(manual_override_json IS NULL OR json_valid(manual_override_json))
);
