import { google } from 'googleapis'
import { getClientForUser } from '../_lib/googleClient.js'

export default async function handler(req, res) {
  const { userId } = req.query
  if (!userId) return res.status(400).json({ error: 'userId mangler' })

  try {
    const auth = await getClientForUser(userId)
    const calendar = google.calendar({ version: 'v3', auth })

    if (req.method === 'GET') {
      const events = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime',
      })
      return res.json({ events: events.data.items ?? [] })
    }

    if (req.method === 'POST') {
      const { summary, description, start, end, attendees = [] } = req.body
      const event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary,
          description,
          start: { dateTime: start },
          end:   { dateTime: end },
          attendees: attendees.map(email => ({ email })),
        },
      })
      return res.json({ event: event.data })
    }

    res.status(405).json({ error: 'Metode ikke støttet' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
