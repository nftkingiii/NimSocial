CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  member_a TEXT NOT NULL REFERENCES users(wallet_address),
  member_b TEXT NOT NULL REFERENCES users(wallet_address),
  context_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_members_ordered CHECK (member_a < member_b),
  CONSTRAINT conversations_distinct_members CHECK (member_a <> member_b)
);

CREATE UNIQUE INDEX conversations_pair_context_unique
ON conversations(member_a, member_b, COALESCE(context_post_id, ''));

CREATE INDEX conversations_member_a_idx ON conversations(member_a, created_at DESC);
CREATE INDEX conversations_member_b_idx ON conversations(member_b, created_at DESC);

CREATE TABLE direct_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX direct_messages_conversation_idx ON direct_messages(conversation_id, created_at ASC);
