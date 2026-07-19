/**
 * [INPUT]: SUPABASE_SECRET_KEY + VITE_SUPABASE_URL from the server environment
 * [OUTPUT]: A privileged Supabase admin client (service role, bypasses RLS)
 * [POS]: Server-only helper for future privileged operations (credits, referrals)
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * SERVER-ONLY. The leading underscore keeps this file from becoming a Vercel
 * route, and it must NEVER be imported from anything under src/ — that would
 * leak SUPABASE_SECRET_KEY into the browser bundle. The URL is public
 * (VITE_SUPABASE_URL), but is read here from the server env, not the client.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

/**
 * Returns a service-role client. Throws if the server env is not configured,
 * so callers fail loudly rather than silently running unprivileged.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached

  const url = process.env.VITE_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) {
    throw new Error('Supabase admin is not configured on the server.')
  }

  cached = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
