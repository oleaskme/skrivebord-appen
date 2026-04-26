import { google } from 'googleapis'
import { getClientForUser } from '../_lib/googleClient.js'

const SUPPORTED_MIME = [
  'application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/plain',
  'text/markdown',
]

export default async function handler(req, res) {
  const { userId, q = '' } = req.query
  if (!userId) return res.status(400).json({ error: 'userId mangler' })

  try {
    const auth = await getClientForUser(userId)
    const drive = google.drive({ version: 'v3', auth })

    const mimeFilter = SUPPORTED_MIME.map(m => `mimeType='${m}'`).join(' or ')
    const query = q
      ? `(${mimeFilter}) and name contains '${q.replace(/'/g, "\\'")}' and trashed=false`
      : `(${mimeFilter}) and trashed=false`

    const res2 = await drive.files.list({
      q: query,
      pageSize: 30,
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink,size)',
      orderBy: 'modifiedTime desc',
    })

    res.json({ files: res2.data.files ?? [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
