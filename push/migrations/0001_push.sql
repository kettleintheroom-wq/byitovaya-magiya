CREATE TABLE installations (
 id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, subscription TEXT, endpoint_hash TEXT UNIQUE,
 timezone TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
 preferences TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL,
 test_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE jobs (
 install_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
 id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('base','custom')),
 ritual_id TEXT NOT NULL, revision TEXT NOT NULL, spec TEXT NOT NULL,
 next_at INTEGER, active INTEGER NOT NULL DEFAULT 1, outcome TEXT,
 PRIMARY KEY(install_id,id)
);
CREATE INDEX jobs_due ON jobs(active,next_at);
CREATE TABLE deliveries (
 install_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
 event_key TEXT NOT NULL, ritual_id TEXT NOT NULL, scheduled_at INTEGER NOT NULL,
 status TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(install_id,event_key)
);
CREATE INDEX deliveries_near ON deliveries(install_id,ritual_id,scheduled_at);
CREATE INDEX deliveries_cleanup ON deliveries(created_at);
CREATE TABLE guards (id TEXT PRIMARY KEY, until_at INTEGER NOT NULL);
