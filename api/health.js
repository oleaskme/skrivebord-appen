// Vercel serverless function — brukes til å verifisere at backend-laget kjører
export default function handler(req, res) {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
}
