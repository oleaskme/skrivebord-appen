-- ============================================================
-- Skrivebord-appen — initial schema
-- Kjør denne i Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- Brukerprofiler (ingen auth i v1.0 — enkel brukervelger)
CREATE TABLE IF NOT EXISTS users (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  google_account_email        TEXT,
  google_refresh_token_enc    TEXT,   -- AES-256-kryptert refresh token
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Mapper (ett prosjekt / arbeidsområde per mappe)
CREATE TABLE IF NOT EXISTS folders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  purpose           TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'on_hold', 'closed')),
  last_activity_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS folders_user_id_idx ON folders(user_id);

-- MASTER-dokumenter
CREATE TABLE IF NOT EXISTS master_documents (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id                       UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  name                            TEXT NOT NULL,
  ai_instruction                  TEXT,
  version_major                   INT NOT NULL DEFAULT 1,
  version_minor                   INT NOT NULL DEFAULT 0,
  drive_file_id                   TEXT,         -- Google Drive fil-ID
  content                         TEXT,         -- Rå OOXML / tekstinnhold (buffer)
  has_unresolved_track_changes    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS master_documents_folder_id_idx ON master_documents(folder_id);

-- INPUT-dokumenter
CREATE TABLE IF NOT EXISTS input_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id           UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  type                TEXT NOT NULL
                        CHECK (type IN ('note', 'meeting', 'email', 'drive_file', 'upload')),
  title               TEXT NOT NULL,
  content             TEXT,
  content_hash_sha256 TEXT,          -- SHA-256 av filinnhold (duplikatkontroll)
  source_id           TEXT,          -- Gmail message-ID eller Drive fil-ID
  status              TEXT NOT NULL DEFAULT 'unprocessed'
                        CHECK (status IN ('unprocessed', 'processed')),
  metadata            JSONB DEFAULT '{}',   -- avsender, dato, emne (e-post) m.m.
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS input_documents_folder_id_idx ON input_documents(folder_id);
CREATE INDEX IF NOT EXISTS input_documents_hash_idx     ON input_documents(folder_id, content_hash_sha256);

-- Logg over AI-kjøringer
CREATE TABLE IF NOT EXISTS ai_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id       UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  master_doc_id   UUID REFERENCES master_documents(id),
  input_doc_ids   UUID[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  summary         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_runs_folder_id_idx ON ai_runs(folder_id);

-- Oppgaver (synkronisert mot Google Tasks)
CREATE TABLE IF NOT EXISTS tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id           UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  due_date            DATE,
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'completed', 'overdue')),
  google_tasks_id     TEXT,
  google_tasklist_id  TEXT,
  ai_suggested        BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_folder_id_idx ON tasks(folder_id);

-- Risikoer (AI-identifisert fra MASTER-dokumenter)
CREATE TABLE IF NOT EXISTS risks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id       UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  source_type     TEXT CHECK (source_type IN ('master', 'input', 'manual')),
  source_id       UUID,
  severity        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (severity IN ('high', 'medium', 'low')),
  status          TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed', 'confirmed', 'dismissed')),
  identified_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risks_folder_id_idx ON risks(folder_id);

-- Møter (koblet til Google Calendar)
CREATE TABLE IF NOT EXISTS meetings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id                 UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  start_time                TIMESTAMPTZ,
  end_time                  TIMESTAMPTZ,
  attendees                 JSONB DEFAULT '[]',
  google_calendar_event_id  TEXT,
  input_doc_id              UUID REFERENCES input_documents(id),   -- møtereferat
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meetings_folder_id_idx ON meetings(folder_id);

-- ============================================================
-- Row Level Security (RLS) — aktiveres per tabell
-- I v1.0 brukes ingen Supabase Auth; anon key har full tilgang.
-- Forbered RLS for fremtidig passordbasert auth (Steg 8.2 i backlog).
-- ============================================================

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE input_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE risks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings          ENABLE ROW LEVEL SECURITY;

-- Midlertidige åpne policyer for v1.0 (ingen auth)
-- Erstatt disse med brukerbaserte policyer når Supabase Auth aktiveres.
CREATE POLICY "open_v1" ON users             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_v1" ON folders           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_v1" ON master_documents  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_v1" ON input_documents   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_v1" ON ai_runs           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_v1" ON tasks             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_v1" ON risks             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_v1" ON meetings          FOR ALL USING (true) WITH CHECK (true);
