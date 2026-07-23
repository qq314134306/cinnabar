/**
 * [INPUT]: Authenticated POST { tier, attemptId }
 * [OUTPUT]: A PayPal order ID created with the server-authoritative tier price
 * [POS]: Future Report checkout order-creation API
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import {
  FUTURE_REPORT_TABLE,
  type FutureReportPurchaseRow,
  expectedOrder,
  parseAttemptId,
  parseExactRequestObject,
  requireFutureReportPaymentsEnabled,
} from './_future-report'
import { getFutureReportProduct, getPayPalServerClient } from './_paypal'
import {
  HttpError,
  errorResponse,
  jsonResponse,
  requireUser,
} from './_require-user'
import { getSupabaseAdmin } from './_supabase-admin'

export const config = { runtime: 'nodejs' }

const MAX_BODY_LENGTH = 1_000

export default async function handler(req: Request): Promise<Response> {
  try {
    requireFutureReportPaymentsEnabled()
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405)
    }
    const user = await requireUser(req)
    const rawBody = await req.text()
    if (rawBody.length > MAX_BODY_LENGTH) {
      throw new HttpError('Request body too large.', 413)
    }

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      throw new HttpError('Invalid JSON body.', 400)
    }
    const body = parseExactRequestObject(parsedBody, ['tier', 'attemptId'])

    const product = getFutureReportProduct(body.tier)
    if (!product) throw new HttpError('Unknown Future Report tier.', 400)
    const attemptId = parseAttemptId(body.attemptId)
    const admin = getSupabaseAdmin()

    const created = await admin
      .rpc('create_future_report_purchase', {
        p_user_id: user.id,
        p_tier: product.tier,
        p_amount_minor: product.amountMinor,
        p_currency: product.currency,
        p_client_attempt_id: attemptId,
      })
      .single()
    if (created.error) {
      if (created.error.message.includes('future_report_open_order_limit')) {
        throw new HttpError(
          'Too many open checkouts. Please retry after the current window.',
          429,
          'OPEN_ORDER_LIMIT',
        )
      }
      if (created.error.message.includes('future_report_attempt_conflict')) {
        throw new HttpError(
          'Checkout attempt already belongs to another product.',
          409,
          'CHECKOUT_ATTEMPT_CONFLICT',
        )
      }
      throw created.error
    }
    const row = created.data as FutureReportPurchaseRow

    if (row.tier !== product.tier) {
      throw new HttpError('Checkout attempt already belongs to another tier.', 409)
    }
    if (row.payment_status === 'completed') {
      throw new HttpError('This checkout attempt has already completed.', 409)
    }
    if (row.paypal_order_id) {
      return jsonResponse({ orderId: row.paypal_order_id }, 200)
    }

    const orderId = await getPayPalServerClient().createOrder(expectedOrder(row))
    const updated = await admin
      .from(FUTURE_REPORT_TABLE)
      .update({
        paypal_order_id: orderId,
        payment_status: 'created',
      })
      .eq('id', row.id)
      .eq('payment_status', 'creating')
      .is('paypal_order_id', null)
      .select('paypal_order_id')
      .single()
    if (updated.error) throw updated.error

    return jsonResponse({ orderId: updated.data.paypal_order_id }, 200)
  } catch (error) {
    return errorResponse(error)
  }
}
