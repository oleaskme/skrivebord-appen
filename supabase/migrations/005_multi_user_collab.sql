-- Flerbruker-samarbeid
-- Legg til is_admin, opprett folder_members, seed Marius og Tatiana, backfill eksisterende mapper

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users SET is_admin = TRUE WHERE name = 'OleM';

INSERT INTO users (name) VALUES ('Marius');
INSERT INTO users (name) VALUES ('Tatiana');

CREATE TABLE IF NOT EXISTS folder_members (
  folder_id   UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (folder_id, user_id)
);

CREATE INDEX IF NOT EXISTS folder_members_user_id_idx ON folder_members(user_id);

ALTER TABLE folder_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_v1" ON folder_members FOR ALL USING (true) WITH CHECK (true);

INSERT INTO folder_members (folder_id, user_id, role)
SELECT id, user_id, 'owner' FROM folders
ON CONFLICT (folder_id, user_id) DO NOTHING;
