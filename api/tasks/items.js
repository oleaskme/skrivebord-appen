import { google } from 'googleapis'
import { getClientForUser } from '../_lib/googleClient.js'

export default async function handler(req, res) {
  const { userId, listId, taskId } = req.query
  if (!userId || !listId) return res.status(400).json({ error: 'userId og listId kreves' })

  try {
    const auth = await getClientForUser(userId)
    const tasksApi = google.tasks({ version: 'v1', auth })

    if (req.method === 'GET') {
      const result = await tasksApi.tasks.list({
        tasklist: listId,
        showCompleted: true,
        maxResults: 100,
      })
      return res.json({ items: result.data.items ?? [] })
    }

    if (req.method === 'POST') {
      const { title, due } = req.body
      const task = await tasksApi.tasks.insert({
        tasklist: listId,
        requestBody: { title, due: due ? new Date(due).toISOString() : undefined },
      })
      return res.json({ task: task.data })
    }

    if (req.method === 'PATCH') {
      if (!taskId) return res.status(400).json({ error: 'taskId kreves' })
      const task = await tasksApi.tasks.patch({
        tasklist: listId,
        task: taskId,
        requestBody: req.body,
      })
      return res.json({ task: task.data })
    }

    if (req.method === 'DELETE') {
      if (!taskId) return res.status(400).json({ error: 'taskId kreves' })
      await tasksApi.tasks.delete({ tasklist: listId, task: taskId })
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Metode ikke støttet' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
