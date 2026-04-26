import { google } from 'googleapis'
import { getClientForUser } from '../_lib/googleClient.js'

function decodeBody(part) {
  if (part.body?.data) {
    return Buffer.from(part.body.data, 'base64').toString('utf8')
  }
  if (part.parts) {
    for (const p of part.parts) {
      const text = decodeBody(p)
      if (text) return text
    }
  }
  return ''
}

export default async function handler(req, res) {
  const { userId, messageId } = req.query
  if (!userId || !messageId) return res.status(400).json({ error: 'userId og messageId kreves' })

  try {
    const auth = await getClientForUser(userId)
    const gmail = google.gmail({ version: 'v1', auth })

    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })

    const headers = msg.data.payload?.headers ?? []
    const get = name => headers.find(h => h.name === name)?.value ?? ''
    const body = decodeBody(msg.data.payload)

    res.json({
      id: messageId,
      subject: get('Subject') || '(uten emne)',
      from: get('From'),
      to: get('To'),
      date: get('Date'),
      body,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
