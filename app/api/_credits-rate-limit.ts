/**
 * [INPUT]: A validated Supabase user ID
 * [OUTPUT]: Per-instance account-read admission decision and retry delay
 * [POS]: SERVER-ONLY best-effort abuse guard for GET /api/credits/account
 *
 * State lives only in one warm Edge isolate. Cold starts and horizontal
 * scale-out create independent buckets, so this is intentionally not presented
 * as a globally authoritative quota. Authentication and database RLS remain the
 * security boundary.
 */

export interface CreditsRateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

export interface CreditsRateLimiter {
  consume(key: string): CreditsRateLimitDecision
}

interface InMemoryRateLimiterOptions {
  maxRequests?: number
  windowMs?: number
  maxTrackedKeys?: number
  now?: () => number
}

export function createInMemoryCreditsRateLimiter(
  options: InMemoryRateLimiterOptions = {},
): CreditsRateLimiter {
  const maxRequests = options.maxRequests ?? 30
  const windowMs = options.windowMs ?? 60_000
  const maxTrackedKeys = options.maxTrackedKeys ?? 10_000
  const now = options.now ?? Date.now
  if (maxRequests < 1 || windowMs < 1 || maxTrackedKeys < 1) {
    throw new Error('Rate limiter options must be positive.')
  }

  const hits = new Map<string, number[]>()

  return {
    consume(key: string): CreditsRateLimitDecision {
      const currentTime = now()
      const recent = (hits.get(key) ?? []).filter(
        (timestamp) => currentTime - timestamp < windowMs,
      )
      if (recent.length >= maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((recent[0] + windowMs - currentTime) / 1_000),
          ),
        }
      }

      if (!hits.has(key) && hits.size >= maxTrackedKeys) {
        const oldestKey = hits.keys().next().value as string | undefined
        if (oldestKey) hits.delete(oldestKey)
      }
      recent.push(currentTime)
      hits.set(key, recent)
      return { allowed: true, retryAfterSeconds: 0 }
    },
  }
}

export const creditAccountRateLimiter = createInMemoryCreditsRateLimiter()
