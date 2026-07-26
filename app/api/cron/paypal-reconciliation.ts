/**
 * [INPUT]: Vercel Cron GET authenticated by the independent CRON_SECRET
 * [OUTPUT]: Fixed-shape aggregate counts for a bounded recent-payment reconciliation
 * [POS]: Private operational endpoint; returns no purchase, user, or PayPal identifiers
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import {
  reconcileRecentPayPalPurchases,
  type PayPalReconciliationCounts,
} from '../_paypal-reconciliation'
import {
  SupabasePayPalPaymentStore,
  type PayPalPaymentStore,
} from '../_paypal-webhook'
import { getPayPalServerClient, type PayPalServerClient } from '../_paypal'
import { jsonResponse } from '../_require-user'

export const config = { runtime: 'nodejs' }

type ReconciliationPayPalClient = Pick<
  PayPalServerClient,
  'retrieveOrderPaymentState'
>

interface ReconciliationHandlerDependencies {
  env?: NodeJS.ProcessEnv
  getClient?: () => ReconciliationPayPalClient
  getStore?: () => PayPalPaymentStore
  reconcile?: (
    client: ReconciliationPayPalClient,
    store: PayPalPaymentStore,
  ) => Promise<PayPalReconciliationCounts>
}

async function secretsEqual(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const actualBytes = new Uint8Array(actualDigest)
  const expectedBytes = new Uint8Array(expectedDigest)
  let difference = actualBytes.length ^ expectedBytes.length
  for (let index = 0; index < actualBytes.length; index += 1) {
    difference |= actualBytes[index] ^ expectedBytes[index]
  }
  return difference === 0
}

export function createPayPalReconciliationHandler(
  dependencies: ReconciliationHandlerDependencies = {},
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'GET') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405)
    }
    const env = dependencies.env ?? process.env
    const cronSecret = env.CRON_SECRET
    if (!cronSecret || cronSecret.length < 16) {
      return jsonResponse({ error: 'Reconciliation is not configured.' }, 503)
    }
    const authorization = req.headers.get('authorization')
    const suppliedSecret = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : ''
    if (!suppliedSecret || !(await secretsEqual(suppliedSecret, cronSecret))) {
      return jsonResponse({ error: 'Unauthorized.' }, 401)
    }

    try {
      const client = dependencies.getClient?.() ?? getPayPalServerClient()
      const store = dependencies.getStore?.() ?? new SupabasePayPalPaymentStore()
      const reconcile = dependencies.reconcile ?? reconcileRecentPayPalPurchases
      const counts = await reconcile(client, store)
      return jsonResponse({ reconciliation: counts })
    } catch {
      console.error('[paypal-reconciliation] run_failed')
      return jsonResponse({ error: 'Reconciliation unavailable.' }, 500)
    }
  }
}

export default createPayPalReconciliationHandler()
