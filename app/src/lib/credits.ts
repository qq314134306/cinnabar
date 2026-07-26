/**
 * [INPUT]: Cookie session or explicit legacy token + sanitized account response
 * [OUTPUT]: A validated balance plus recent, display-ready credit activity
 * [POS]: Browser read boundary for the authenticated credit wallet
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * The browser never queries credit_ledger or its metadata/business keys. The
 * authenticated API resolves identity from the BFF cookie or the explicit
 * legacy-mode Bearer token and reads only its safe account view under RLS.
 */

export const RECENT_CREDIT_TRANSACTION_LIMIT = 8

type CreditEntryType = 'registration_grant' | 'debit'

export interface CreditTransaction {
  id: string
  amount: number
  entryType: CreditEntryType
  createdAt: string
}

export interface CreditWalletData {
  balance: number
  transactions: CreditTransaction[]
}

interface CreditAccountEntry {
  id?: unknown
  amount?: unknown
  type?: unknown
  created_at?: unknown
}

interface CreditAccountPayload {
  data?: {
    balance?: unknown
    entries?: unknown
  }
}

/** A safe, intentionally non-diagnostic error for the account-facing UI. */
export class CreditWalletUnavailableError extends Error {
  constructor() {
    super('Credit wallet is unavailable.')
    this.name = 'CreditWalletUnavailableError'
  }
}

function parseInteger(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed)) throw new CreditWalletUnavailableError()
  return parsed
}

function normalizeTransaction(entry: CreditAccountEntry): CreditTransaction {
  const amount = parseInteger(entry.amount)
  if (entry.type !== 'registration_grant' && entry.type !== 'debit') {
    throw new CreditWalletUnavailableError()
  }

  const entryType = entry.type
  const hasExpectedDirection = (
    (entryType === 'registration_grant' && amount > 0)
    || (entryType === 'debit' && amount < 0)
  )

  if (
    typeof entry.id !== 'string'
    || !/^[1-9]\d{0,18}$/.test(entry.id)
    || !hasExpectedDirection
    || typeof entry.created_at !== 'string'
    || Number.isNaN(Date.parse(entry.created_at))
  ) {
    throw new CreditWalletUnavailableError()
  }

  return {
    id: entry.id,
    amount,
    entryType,
    createdAt: entry.created_at,
  }
}

function normalizeWalletPayload(payload: unknown): CreditWalletData {
  if (!payload || typeof payload !== 'object') throw new CreditWalletUnavailableError()

  const account = (payload as CreditAccountPayload).data
  if (!account || !Array.isArray(account.entries)) {
    throw new CreditWalletUnavailableError()
  }

  const balance = parseInteger(account.balance)
  if (balance < 0) throw new CreditWalletUnavailableError()

  return {
    balance,
    transactions: account.entries.map((entry) => {
      if (!entry || typeof entry !== 'object') throw new CreditWalletUnavailableError()
      return normalizeTransaction(entry as CreditAccountEntry)
    }),
  }
}

/**
 * Reads the signed-in account through the cookie BFF, adding a Bearer header
 * only when the caller explicitly supplies the in-memory legacy-mode token.
 * Server error bodies are ignored so raw dependency diagnostics never reach UI.
 */
export async function loadCreditWallet(
  fetcher: typeof fetch = fetch,
  legacyAccessToken: string | null = null,
): Promise<CreditWalletData> {
  let response: Response
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (legacyAccessToken) {
    headers.Authorization = `Bearer ${legacyAccessToken}`
  }

  try {
    response = await fetcher(
      `/api/credits/account?limit=${RECENT_CREDIT_TRANSACTION_LIMIT}`,
      {
        method: 'GET',
        credentials: 'same-origin',
        headers,
        cache: 'no-store',
      },
    )
  } catch {
    throw new CreditWalletUnavailableError()
  }

  if (!response.ok) throw new CreditWalletUnavailableError()

  try {
    return normalizeWalletPayload(await response.json())
  } catch {
    throw new CreditWalletUnavailableError()
  }
}

export function getCreditActionLabel(entryType: CreditEntryType): string {
  if (entryType === 'registration_grant') return 'Welcome credits'
  return 'Credits used'
}

export function formatCreditAmount(amount: number): string {
  return amount >= 0 ? `+${amount}` : `\u2212${Math.abs(amount)}`
}

export function formatCreditDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(isoDate))
}
