/**
 * [INPUT]: Server AUTH_MODE and authenticated API failures
 * [OUTPUT]: Strict auth-mode parsing and stable HTTP-safe auth errors
 * [POS]: SERVER-ONLY primitives shared by the opaque-session BFF
 */

export type AuthMode = 'legacy' | 'dual' | 'opaque'

export class AppAuthError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message)
    this.name = 'AppAuthError'
    this.status = status
    this.code = code
  }
}

export function readAuthMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  const value = env.AUTH_MODE
  if (value === undefined || value === '') return 'legacy'
  if (value === 'legacy' || value === 'dual' || value === 'opaque') return value
  throw new AppAuthError(
    'Authentication is temporarily unavailable.',
    503,
    'AUTH_MODE_INVALID',
  )
}

export function readOptionalBearerToken(req: Request): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization) return null
  const match = authorization.match(/^Bearer[ \t]+(\S+)$/i)
  const token = match?.[1]
  if (!token || token.length > 8_192) {
    throw new AppAuthError('A valid session is required.', 401, 'INVALID_SESSION')
  }
  return token
}
