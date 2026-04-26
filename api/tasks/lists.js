import { google } from 'googleapis'
import { getClientForUser } from '../_lib/googleClient.js'

export default async function handler(req, res) {
  const { userId } = req.query
  if (!userId) return res.status(400).json({ error: 'userId mangler' })

  try {
    const auth = await getClientForUser(userId)
    const tasks = google.tasks({ version: 'v1', auth })

    if (req.method === 'GET') {
      const lists = await tasks.tasklists.list({ maxResults: 100 })
      return res.json({ lists: lists.data.items ?? [] })
    }

    if (req.method === 'POST') {
      // Opprett ny oppgaveliste (én per mappe)
      const { title } = req.body
      const list = await tasks.tasklists.insert({ requestBody: { title } })
      return res.json({ list: list.data })
    }

    res.status(405).json({ error: 'Metode ikke støttet' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
