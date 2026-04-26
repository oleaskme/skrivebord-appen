import { google } from 'googleapis'
import { getClientForUser } from '../_lib/googleClient.js'

export default async function handler(req, res) {
  const { userId, q = '', pageToken } = req.query
  if (!userId) return res.status(400).json({ error: 'userId mangler' })

  try {
    const auth = await getClientForUser(userId)
    const gmail = google.gmail({ version: 'v1', auth })

    const listRes = await gmail.users.threads.list({
      userId: 'me',
      q,
      maxResults: 20,
      pageToken: pageToken || undefined,
    })

    const threads = listRes.data.threads ?? []

    const details = await Promise.all(
      threads.map(async t => {
        const thread = await gmail.users.threads.get({
          userId: 'me',
          id: t.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        })
        const msg = thread.data.messages?.[0]
        const headers = msg?.payload?.headers ?? []
        const get = name => headers.find(h => h.name === name)?.value ?? ''
        return {
          id: t.id,
          messageId: msg?.id,
          subject: get('Subject') || '(uten emne)',
          from: get('From'),
          date: get('Date'),
          snippet: thread.data.messages?.at(-1)?.snippet ?? '',
        }
      })
    )

    res.json({ threads: details, nextPageToken: listRes.data.nextPageToken ?? null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
