import { google } from 'googleapis'
import { createOAuthClient } from '../../_lib/googleClient.js'
import { supabase } from '../../_lib/supabase.js'
import { encrypt } from '../../_lib/crypto.js'

export default async function handler(req, res) {
  const { code, state: userId, error } = req.query

  if (error || !code || !userId) {
    return res.redirect('/?googleError=true')
  }

  try {
    const client = createOAuthClient()
    const { tokens } = await client.getToken(code)

    if (!tokens.refresh_token) {
      return res.redirect('/?googleError=noRefreshToken')
    }

    // Hent brukerens Google-e-post
    client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const { data: userInfo } = await oauth2.userinfo.get()

    // Lagre kryptert refresh token og e-post i Supabase
    const encryptedToken = encrypt(tokens.refresh_token)
    await supabase
      .from('users')
      .update({
        google_refresh_token_enc: encryptedToken,
        google_account_email: userInfo.email,
      })
      .eq('id', userId)

    res.redirect('/?googleConnected=true')
  } catch (err) {
    console.error('OAuth callback feil:', err.message)
    res.redirect('/?googleError=true')
  }
}
