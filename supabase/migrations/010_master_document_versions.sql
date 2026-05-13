CREATE TABLE IF NOT EXISTS master_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_doc_id UUID NOT NULL REFERENCES master_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  version_label TEXT NOT NULL,
  version_major INTEGER NOT NULL DEFAULT 1,
  version_minor INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_master_document_versions_master_doc_id ON master_document_versions(master_doc_id);

ALTER TABLE master_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read versions in their folders"
  ON master_document_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM master_documents md
      JOIN folders f ON f.id = md.folder_id
      JOIN folder_members fm ON fm.folder_id = f.id
      WHERE md.id = master_document_versions.master_doc_id
        AND fm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert versions in their folders"
  ON master_document_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM master_documents md
      JOIN folders f ON f.id = md.folder_id
      JOIN folder_members fm ON fm.folder_id = f.id
      WHERE md.id = master_document_versions.master_doc_id
        AND fm.user_id = auth.uid()
    )
  );
