import { getAuthUrl } from '../_lib/googleClient.js'

export default function handler(req, res) {
  const { userId } = req.query
  if (!userId) {
    return res.status(400).json({ error: 'userId mangler' })
  }
  const url = getAuthUrl(userId)
  res.redirect(url)
}
