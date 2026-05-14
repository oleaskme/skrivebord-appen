import { supabaseAdmin } from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode ikke støttet' })

  const { masterDocId, content, versionLabel, versionMajor, versionMinor, createdBy } = req.body
  if (!masterDocId || !content || !versionLabel) {
    return res.status(400).json({ error: 'masterDocId, content og versionLabel kreves' })
  }

  const { data, error } = await supabaseAdmin.from('master_document_versions').insert({
    master_doc_id: masterDocId,
    content,
    version_label: versionLabel,
    version_major: versionMajor ?? 1,
    version_minor: versionMinor ?? 0,
    created_by: createdBy ?? null,
  }).select('id').single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ id: data.id })
}
