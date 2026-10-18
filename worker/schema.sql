-- MIDI HUD trusted devices and private Google Drive OAuth storage.
-- Apply ONCE to a Cloudflare D1 database named midi-hud-auth-db.
-- Do not store Google credentials in the public repository.
CREATE TABLE IF NOT EXISTS google_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  refresh_cipher TEXT NOT NULL,
  access_cipher TEXT,
  access_expires_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_flows (
  state_hash TEXT PRIMARY KEY NOT NULL,
  proof_hash TEXT NOT NULL,
  verifier_cipher TEXT NOT NULL,
  return_path TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_flows_exp ON oauth_flows(expires_at);
CREATE TABLE IF NOT EXISTS handoff_tickets (
  ticket_hash TEXT PRIMARY KEY NOT NULL,
  proof_hash TEXT NOT NULL,
  account_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES google_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_handoff_exp ON handoff_tickets(expires_at);
CREATE TABLE IF NOT EXISTS trusted_devices (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES google_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_trusted_account ON trusted_devices(account_id,revoked_at);
