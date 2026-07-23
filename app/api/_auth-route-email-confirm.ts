/**
 * [INPUT]: Exact scanner-safe GET or guarded explicit-click TokenHash POST
 * [OUTPUT]: Self-contained confirmation HTML or minimal opaque app session
 * [POS]: Email-link scanner isolation; GET never claims or verifies
 */

import {
  clearLoginCsrfCookie,
  clearLoginFlowCookie,
  claimEmailLoginTransaction,
  createLoginCsrfToken,
  loginCsrfCookie,
  normalizeEmailTokenHash,
  readLoginFlowCookie,
  readStrictJsonObject,
  requireLoginPostGuards,
  validateEmailLoginTransaction,
  verifyEmailLogin,
} from './_auth-login'
import {
  createOpaqueSessionFromTrustedSupabaseSession,
  publicSession,
  sessionCookie,
} from './_app-session'
import { authJson } from './_auth-http'
import { bytesToBase64Url, readAppOrigin } from './_csrf'

export const config = { runtime: 'edge' }

const EMAIL_CONFIRM_PATH = '/api/auth/email-confirm'
const MAX_BODY_BYTES = 1_024
const FAILURE_BODY = {
  error: {
    code: 'EMAIL_VERIFICATION_FAILED',
    message: 'Email verification could not be completed. Please start again.',
  },
}

function requireExactRequest(req: Request): void {
  if (req.url.length > 4_096) throw new Error('invalid request')
  const url = new URL(req.url)
  if (
    url.origin !== readAppOrigin()
    || url.pathname !== EMAIL_CONFIRM_PATH
    || url.search
    || url.hash
  ) {
    throw new Error('invalid request')
  }
}

function randomNonce(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

function withTerminalCookies(
  response: Response,
  sidCookie?: string,
): Response {
  const headers = new Headers(response.headers)
  if (sidCookie) headers.append('Set-Cookie', sidCookie)
  headers.append('Set-Cookie', clearLoginFlowCookie())
  headers.append('Set-Cookie', clearLoginCsrfCookie())
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function fixedFailure(status = 400, allow?: string): Response {
  return withTerminalCookies(authJson(
    FAILURE_BODY,
    status,
    allow ? { Allow: allow } : {},
  ))
}

function passiveFailure(status = 400): Response {
  return authJson(FAILURE_BODY, status)
}

function confirmationHtml(csrfToken: string, nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Confirm your Cinnabar sign-in</title>
  <style nonce="${nonce}">
    :root{color-scheme:light;background:#f8f5ef;color:#211c19;font:16px/1.5 system-ui,sans-serif}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}
    main{width:min(100%,420px);background:#fff;border:1px solid #ded6ca;border-radius:18px;padding:28px;box-shadow:0 16px 40px #30281f14}
    h1{font-size:1.5rem;margin:0 0 12px}p{margin:0 0 20px;color:#5b514b}
    button{width:100%;border:0;border-radius:12px;padding:13px 16px;background:#9d2f2f;color:#fff;font:inherit;font-weight:700;cursor:pointer}
    button:disabled{cursor:wait;opacity:.65}#status{min-height:24px;margin:14px 0 0;font-size:.925rem}
  </style>
</head>
<body>
  <main>
    <h1>Confirm your sign-in</h1>
    <p>For your security, Cinnabar signs you in only after you press the button below.</p>
    <button id="confirm" type="button">Continue to Cinnabar</button>
    <p id="status" role="status" aria-live="polite"></p>
  </main>
  <script nonce="${nonce}">
    (() => {
      const rawFragment = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : ''
      window.history.replaceState(null, '', window.location.pathname)
      const fragment = new URLSearchParams(rawFragment)
      const values = fragment.getAll('token_hash')
      const keys = Array.from(fragment.keys())
      let tokenHash = values.length === 1
        && keys.every((key) => key === 'token_hash')
        && /^[A-Za-z0-9_-]{32,256}$/.test(values[0])
        ? values[0]
        : ''
      const button = document.getElementById('confirm')
      const status = document.getElementById('status')
      if (!tokenHash) {
        button.disabled = true
        status.textContent = 'This sign-in link is invalid. Please request a new email.'
        return
      }
      button.addEventListener('click', async () => {
        button.disabled = true
        status.textContent = 'Confirming\u2026'
        const requestBody = JSON.stringify({ tokenHash })
        tokenHash = ''
        try {
          const response = await fetch('${EMAIL_CONFIRM_PATH}', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF': ${JSON.stringify(csrfToken)},
            },
            body: requestBody,
          })
          if (!response.ok) throw new Error('verification failed')
          window.location.replace('/?auth_callback=success')
        } catch {
          status.textContent = 'Sign-in could not be completed. Please request a new email.'
        }
      }, { once: true })
    })()
  </script>
</body>
</html>`
}

async function handleGet(req: Request): Promise<Response> {
  try {
    requireExactRequest(req)
    const handle = readLoginFlowCookie(req)
    await validateEmailLoginTransaction(handle)
    const csrfToken = createLoginCsrfToken()
    const nonce = randomNonce()
    return new Response(confirmationHtml(csrfToken, nonce), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, private',
        Pragma: 'no-cache',
        'Content-Security-Policy':
          `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy':
          'camera=(), microphone=(), geolocation=(), payment=()',
        Vary: 'Cookie',
        'Set-Cookie': loginCsrfCookie(csrfToken),
      },
    })
  } catch {
    return passiveFailure()
  }
}

async function handlePost(req: Request): Promise<Response> {
  try {
    requireExactRequest(req)
    requireLoginPostGuards(req)
    const body = await readStrictJsonObject(req, MAX_BODY_BYTES)
    if (
      Object.keys(body).length !== 1
      || !('tokenHash' in body)
    ) {
      return fixedFailure()
    }
    const tokenHash = normalizeEmailTokenHash(body.tokenHash)
    const handle = readLoginFlowCookie(req)

    // The landing GET is passive; this explicit user action performs the
    // one-use database claim before the one-use provider verification.
    await claimEmailLoginTransaction(handle)
    const trustedSession = await verifyEmailLogin({
      token_hash: tokenHash,
      type: 'email',
    })
    const created = await createOpaqueSessionFromTrustedSupabaseSession(
      req,
      trustedSession,
    )
    return withTerminalCookies(
      authJson({ ...publicSession(created.context) }),
      sessionCookie(created.sid),
    )
  } catch {
    return fixedFailure()
  }
}

function handleHead(req: Request): Response {
  try {
    requireExactRequest(req)
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-store, private',
        Pragma: 'no-cache',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    // A speculative HEAD must never mutate browser auth cookies, even when a
    // scanner probes an invalid URL.
    return new Response(null, {
      status: 400,
      headers: {
        'Cache-Control': 'no-store, private',
        Pragma: 'no-cache',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'HEAD') return handleHead(req)
  if (req.method === 'GET') return handleGet(req)
  if (req.method === 'POST') return handlePost(req)
  return fixedFailure(405, 'GET, HEAD, POST')
}
