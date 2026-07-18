/**
 * [INPUT]: An email string and a source label from EmailCapture
 * [OUTPUT]: POSTs to /api/subscribe; resolves ok / throws with a friendly message
 * [POS]: Client helper between EmailCapture.tsx and the api/subscribe edge function
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * The Make webhook URL lives only on the server (api/subscribe); the browser
 * only ever talks to our own /api/subscribe endpoint.
 */

const SUBSCRIBE_ENDPOINT = '/api/subscribe'

/** Lightweight client-side check so we can give instant feedback before the round-trip. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export async function subscribeEmail(email: string, source: string): Promise<void> {
  const response = await fetch(SUBSCRIBE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), source }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || 'Something went wrong. Please try again.')
  }
}
