/**
 * [INPUT]: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (public, build-time env)
 * [OUTPUT]: A browser Supabase client (or null when env is absent)
 * [POS]: Frontend auth/data client used by the auth store and UI
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * Only the PUBLISHABLE key lives here — it is designed to be shipped to the
 * browser and is gated by row-level security. The SECRET key is never imported
 * on the client (see api/_supabase-admin.ts for server-only privileged access).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** True when both public env vars are present (production). */
export const isSupabaseConfigured = Boolean(url && publishableKey)

/**
 * The browser client. Null when env vars are missing (e.g. local build with no
 * secrets) so the rest of the app can degrade gracefully instead of crashing.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, publishableKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
