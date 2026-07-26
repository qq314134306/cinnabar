/**
 * [INPUT]: Credit API response bodies and expected operational errors
 * [OUTPUT]: Consistent JSON responses with request IDs and safe cache headers
 * [POS]: SERVER-ONLY HTTP primitives shared by credit endpoints
 */

export class CreditsApiError extends Error {
  readonly status: number
  readonly code: string
  readonly responseHeaders: Readonly<Record<string, string>>

  constructor(
    status: number,
    code: string,
    message: string,
    responseHeaders: Readonly<Record<string, string>> = {},
  ) {
    super(message)
    this.name = 'CreditsApiError'
    this.status = status
    this.code = code
    this.responseHeaders = responseHeaders
  }
}

export type CreditsInternalErrorCategory =
  | 'credit_account_read_failed'
  | 'credit_account_data_invalid'
  | 'credit_debit_failed'
  | 'unclassified_internal_error'

export class CreditsInternalError extends Error {
  readonly category: CreditsInternalErrorCategory

  constructor(category: CreditsInternalErrorCategory) {
    super('Internal credits service failure.')
    this.name = 'CreditsInternalError'
    this.category = category
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i

export function requestIdFor(
  req: Request,
  generate: () => string = () => crypto.randomUUID(),
): string {
  const supplied = req.headers.get('x-request-id')
  return supplied && (UUID_PATTERN.test(supplied) || ULID_PATTERN.test(supplied))
    ? supplied
    : generate()
}

export function creditsJson(
  body: Record<string, unknown>,
  status: number,
  requestId: string,
  cacheControl = 'no-store',
  additionalHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Request-ID': requestId,
      'X-Content-Type-Options': 'nosniff',
      ...additionalHeaders,
    },
  })
}

export function creditsErrorResponse(error: unknown, requestId: string): Response {
  if (error instanceof CreditsApiError) {
    return creditsJson(
      { error: { code: error.code, message: error.message, request_id: requestId } },
      error.status,
      requestId,
      'no-store',
      error.responseHeaders,
    )
  }

  const errorCategory = error instanceof CreditsInternalError
    ? error.category
    : 'unclassified_internal_error'
  console.error(JSON.stringify({
    level: 'error',
    event: 'credits_api_unhandled_error',
    request_id: requestId,
    error_category: errorCategory,
  }))
  return creditsJson(
    {
      error: {
        code: 'internal_error',
        message: 'The credits service is temporarily unavailable.',
        request_id: requestId,
      },
    },
    503,
    requestId,
  )
}
