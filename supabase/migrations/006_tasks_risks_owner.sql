-- Legg til owner_id på oppgaver og risikoer, backfill med OleM
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE tasks SET owner_id = (SELECT id FROM users WHERE name = 'OleM') WHERE owner_id IS NULL;
UPDATE risks SET owner_id = (SELECT id FROM users WHERE name = 'OleM') WHERE owner_id IS NULL;
