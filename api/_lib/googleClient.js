import { google } from 'googleapis'
import { supabase } from './supabase.js'
import { decrypt } from './crypto.js'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/userinfo.email',
]

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getAuthUrl(userId) {
  const client = createOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: userId,
  })
}

export async function getClientForUser(userId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('google_refresh_token_enc')
    .eq('id', userId)
    .single()

  if (error || !user?.google_refresh_token_enc) {
    throw new Error('Google-konto ikke koblet til denne brukeren')
  }

  const refreshToken = decrypt(user.google_refresh_token_enc)
  const client = createOAuthClient()
  client.setCredentials({ refresh_token: refreshToken })
  return client
}
