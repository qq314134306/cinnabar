/**
 * [INPUT]: Validated, user-scoped Supabase clients
 * [OUTPUT]: Paginated credit-account snapshots
 * [POS]: SERVER-ONLY, least-privilege account reader; not a Vercel route
 *
 * This module deliberately has no service-role dependency. Product debits live
 * in _credits-spend.ts so the account endpoint's bundle retains only RLS access.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { CreditsApiError, CreditsInternalError } from './_credits-http'

const DEFAULT_LEDGER_LIMIT = 20
const MAX_LEDGER_LIMIT = 50
const POSITIVE_DECIMAL_PATTERN = /^[1-9]\d*$/
const MAX_BIGINT_CURSOR = 9_223_372_036_854_775_807n
const MAX_BIGINT_CURSOR_LENGTH = 19

interface CreditLedgerRow {
  id: number | string
  amount: number
  entry_type: 'registration_grant' | 'debit'
  created_at: string
}

export interface CreditAccountPage {
  balance: number
  entries: Array<{
    id: string
    amount: number
    type: CreditLedgerRow['entry_type']
    created_at: string
  }>
  next_cursor: string | null
}

export interface CreditAccountPageOptions {
  limit: number
  cursor: string | null
}

export function parseCreditAccountPage(url: string): CreditAccountPageOptions {
  const search = new URL(url).searchParams
  const rawLimit = search.get('limit')
  if (rawLimit !== null && !POSITIVE_DECIMAL_PATTERN.test(rawLimit)) {
    throw new CreditsApiError(
      400,
      'invalid_pagination',
      `limit must be a canonical decimal integer from 1 to ${MAX_LEDGER_LIMIT}.`,
    )
  }
  const limit = rawLimit === null ? DEFAULT_LEDGER_LIMIT : Number(rawLimit)
  if (limit > MAX_LEDGER_LIMIT) {
    throw new CreditsApiError(
      400,
      'invalid_pagination',
      `limit must be a canonical decimal integer from 1 to ${MAX_LEDGER_LIMIT}.`,
    )
  }

  const cursor = search.get('cursor')
  if (
    cursor !== null
    && (
      cursor.length > MAX_BIGINT_CURSOR_LENGTH
      || !POSITIVE_DECIMAL_PATTERN.test(cursor)
      || BigInt(cursor) > MAX_BIGINT_CURSOR
    )
  ) {
    throw new CreditsApiError(
      400,
      'invalid_pagination',
      'cursor must be a canonical PostgreSQL bigint ledger ID.',
    )
  }

  return { limit, cursor }
}

function safeInteger(value: unknown): number {
  const numberValue = typeof value === 'string' ? Number(value) : value
  if (!Number.isSafeInteger(numberValue)) {
    throw new CreditsInternalError('credit_account_data_invalid')
  }
  return numberValue as number
}

function safeLedgerId(value: unknown): string {
  const ledgerId = String(value)
  if (
    ledgerId.length > MAX_BIGINT_CURSOR_LENGTH
    || !POSITIVE_DECIMAL_PATTERN.test(ledgerId)
    || BigInt(ledgerId) > MAX_BIGINT_CURSOR
  ) {
    throw new CreditsInternalError('credit_account_data_invalid')
  }
  return ledgerId
}

export async function loadCreditAccountPage(
  client: SupabaseClient,
  options: CreditAccountPageOptions,
): Promise<CreditAccountPage> {
  const balanceRequest = client
    .from('credit_balances')
    .select('balance')
    .maybeSingle()

  let ledgerRequest = client
    .from('credit_activity')
    .select('id, amount, entry_type, created_at')
    .order('id', { ascending: false })
    .limit(options.limit + 1)
  if (options.cursor) {
    ledgerRequest = ledgerRequest.lt('id', options.cursor)
  }

  const [balanceResult, ledgerResult] = await Promise.all([balanceRequest, ledgerRequest])
  if (balanceResult.error || ledgerResult.error) {
    throw new CreditsInternalError('credit_account_read_failed')
  }

  const balance = safeInteger(balanceResult.data?.balance ?? 0)
  const rows = (ledgerResult.data ?? []) as CreditLedgerRow[]
  const hasMore = rows.length > options.limit
  const entries = rows.slice(0, options.limit).map((row) => {
    if (
      (row.entry_type !== 'registration_grant' && row.entry_type !== 'debit')
      || typeof row.created_at !== 'string'
      || Number.isNaN(Date.parse(row.created_at))
    ) {
      throw new CreditsInternalError('credit_account_data_invalid')
    }
    return {
      id: safeLedgerId(row.id),
      amount: safeInteger(row.amount),
      type: row.entry_type,
      created_at: row.created_at,
    }
  })

  return {
    balance,
    entries,
    next_cursor: hasMore ? entries.at(-1)?.id ?? null : null,
  }
}
