-- Legg til lukket-status og metadata på risikoer
ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS closed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by   TEXT;

-- Utvid status-constraint til å inkludere 'closed'
ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_status_check;
ALTER TABLE risks ADD CONSTRAINT risks_status_check
  CHECK (status IN ('proposed', 'confirmed', 'dismissed', 'closed'));
