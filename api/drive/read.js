import { google } from 'googleapis'
import { getClientForUser } from '../_lib/googleClient.js'

export default async function handler(req, res) {
  const { userId, fileId } = req.query
  if (!userId || !fileId) return res.status(400).json({ error: 'userId og fileId kreves' })

  try {
    const auth = await getClientForUser(userId)
    const drive = google.drive({ version: 'v3', auth })

    const meta = await drive.files.get({ fileId, fields: 'id,name,mimeType' })
    const { mimeType, name } = meta.data

    let content = ''

    if (mimeType === 'application/vnd.google-apps.document') {
      // Google Docs — eksporter som ren tekst
      const exported = await drive.files.export(
        { fileId, mimeType: 'text/plain' },
        { responseType: 'text' }
      )
      content = exported.data
    } else {
      // Binærfil (docx, pdf, txt) — last ned som buffer
      const downloaded = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      )
      // Returner base64 for binærfiler — frontend tolker videre
      content = Buffer.from(downloaded.data).toString('base64')
    }

    res.json({ fileId, name, mimeType, content })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
