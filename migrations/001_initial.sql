CREATE TYPE post_kind AS ENUM ('request', 'service', 'update', 'proof');
CREATE TYPE post_state AS ENUM ('draft', 'published', 'rejected');
CREATE TYPE job_state AS ENUM ('open', 'funding', 'funded', 'submitted', 'approved', 'disputed', 'settled', 'refunded', 'cancelled');

CREATE TABLE users (
  wallet_address TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  display_name TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  nonce_hash TEXT NOT NULL UNIQUE,
  message TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  client_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  worker_wallet TEXT REFERENCES users(wallet_address),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  budget_usdt_micros BIGINT NOT NULL CHECK (budget_usdt_micros > 0),
  deadline TIMESTAMPTZ NOT NULL,
  arbiter_address TEXT,
  escrow_job_id TEXT UNIQUE,
  escrow_tx_hash TEXT UNIQUE,
  state job_state NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  kind post_kind NOT NULL,
  body TEXT NOT NULL,
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  state post_state NOT NULL DEFAULT 'draft',
  payment_reference TEXT NOT NULL UNIQUE,
  required_luna BIGINT NOT NULL CHECK (required_luna >= 0),
  payment_tx_hash TEXT UNIQUE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, applicant_wallet)
);

CREATE TABLE job_messages (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sender_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_wallet TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX posts_feed_idx ON posts (published_at DESC, id DESC) WHERE state = 'published';
CREATE INDEX posts_job_idx ON posts (job_id, created_at DESC);
CREATE INDEX jobs_state_idx ON jobs (state, created_at DESC);
CREATE INDEX sessions_token_idx ON sessions (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX audit_resource_idx ON audit_events (resource_type, resource_id, created_at DESC);
