import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Service role client bypasses RLS — used for server-side writes
export const supabaseAdmin = createClient(url, serviceKey || anonKey)

// Anon client — used for reads where RLS should apply
export const supabase = createClient(url, anonKey)
