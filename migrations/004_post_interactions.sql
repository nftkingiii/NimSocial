CREATE TABLE post_replies (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX post_replies_post_idx ON post_replies(post_id, created_at ASC);

CREATE TABLE post_engagements (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES users(wallet_address),
  type TEXT NOT NULL CHECK (type IN ('repost','appreciate','bookmark')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, wallet_address, type)
);

CREATE INDEX post_engagements_post_type_idx ON post_engagements(post_id, type);
