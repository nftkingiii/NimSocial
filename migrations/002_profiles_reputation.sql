ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_role TEXT CHECK (profile_role IN ('worker','client','both'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS professional_title TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'not_open' CHECK (availability IN ('open','busy','not_open'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_preference TEXT CHECK (work_preference IN ('remote','hybrid','onsite','flexible'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS follows (
  follower_wallet TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  followed_wallet TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_wallet, followed_wallet),
  CHECK (follower_wallet <> followed_wallet)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reviewer_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  subject_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  quality SMALLINT NOT NULL CHECK (quality BETWEEN 1 AND 5),
  delivery SMALLINT NOT NULL CHECK (delivery BETWEEN 1 AND 5),
  communication SMALLINT NOT NULL CHECK (communication BETWEEN 1 AND 5),
  reliability SMALLINT NOT NULL CHECK (reliability BETWEEN 1 AND 5),
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, reviewer_wallet, subject_wallet),
  CHECK (reviewer_wallet <> subject_wallet)
);

CREATE INDEX IF NOT EXISTS users_discovery_idx ON users (availability, onboarding_completed_at DESC) WHERE onboarding_completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS follows_followed_idx ON follows (followed_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_subject_idx ON reviews (subject_wallet, created_at DESC);
