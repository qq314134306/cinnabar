/**
 * [INPUT]: Authenticated POST { orderId, reportInput:{ birth, persona } }
 * [OUTPUT]: Verified paid Future Report entitlement
 * [POS]: Server-side PayPal capture boundary; never trusts browser amount/status
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import {
  FUTURE_REPORT_TABLE,
  type FutureReportPurchaseRow,
  expectedOrder,
  publicPurchase,
  requireFutureReportPaymentsEnabled,
} from './_future-report'
import {
  assertTrustedGenerationInput,
  rebuildFutureReportSnapshot,
} from './_future-report-chart'
import { getPayPalServerClient } from './_paypal'
import {
  HttpError,
  errorResponse,
  jsonResponse,
  requireUser,
} from './_require-user'
import { getSupabaseAdmin } from './_supabase-admin'

export const config = { runtime: 'nodejs' }

const MAX_BODY_LENGTH = 4_000
const ORDER_ID_RE = /^[A-Z0-9]{8,32}$/i

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

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      throw new HttpError('Invalid JSON body.', 400)
    }
    if (
      !body
      || typeof body !== 'object'
      || Array.isArray(body)
      || Object.keys(body).some((key) => key !== 'orderId' && key !== 'reportInput')
      || !Object.prototype.hasOwnProperty.call(body, 'reportInput')
    ) {
      throw new HttpError(
        'Capture request contains unsupported fields.',
        400,
        'INVALID_REPORT_INPUT',
      )
    }
    if (typeof body.orderId !== 'string' || !ORDER_ID_RE.test(body.orderId)) {
      throw new HttpError('A valid PayPal order ID is required.', 400)
    }
    const admin = getSupabaseAdmin()

    const selected = await admin
      .from(FUTURE_REPORT_TABLE)
      .select('*')
      .eq('user_id', user.id)
      .eq('paypal_order_id', body.orderId)
      .maybeSingle()
    if (selected.error) throw selected.error
    if (!selected.data) throw new HttpError('Checkout order was not found.', 404)
    let row = selected.data as FutureReportPurchaseRow
    const generationInput = await rebuildFutureReportSnapshot(
      body.reportInput,
      row.tier,
    )

    // Persist the complete generation snapshot before money moves. If PayPal
    // succeeds but our final DB write fails, the same order can be recovered.
    if (row.payment_status === 'created') {
      const prepared = await admin
        .from(FUTURE_REPORT_TABLE)
        .update({
          generation_input: generationInput,
          chart_fingerprint: generationInput.chartFingerprint,
          payment_status: 'capture_pending',
        })
        .eq('id', row.id)
        .eq('payment_status', 'created')
        .select('*')
        .single()
      if (prepared.error) throw prepared.error
      row = prepared.data as FutureReportPurchaseRow
    } else if (
      row.payment_status === 'capture_pending' ||
      row.payment_status === 'completed'
    ) {
      assertTrustedGenerationInput(
        row.generation_input,
        row.tier,
        row.chart_fingerprint,
      )
      if (row.chart_fingerprint !== generationInput.chartFingerprint) {
        throw new HttpError(
          'This payment belongs to a different chart.',
          409,
          'CHART_FINGERPRINT_CONFLICT',
        )
      }
      if (row.generation_input.persona !== generationInput.persona) {
        throw new HttpError(
          'This payment already has a different report persona.',
          409,
          'REPORT_PERSONA_CONFLICT',
        )
      }
    } else {
      throw new HttpError(
        'This payment can no longer be captured.',
        409,
        'PAYMENT_STATE_TERMINAL',
      )
    }

    const verified = row.payment_status === 'completed'
      ? await getPayPalServerClient().retrieveAndVerifyOrder(body.orderId, expectedOrder(row))
      : await getPayPalServerClient().captureAndVerifyOrder(body.orderId, expectedOrder(row))

    const completed = await admin
      .from(FUTURE_REPORT_TABLE)
      .update({
        paypal_capture_id: verified.captureId,
        payment_status: 'completed',
        payment_completed_at: row.payment_completed_at ?? new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('user_id', user.id)
      .eq('payment_status', row.payment_status)
      .select('*')
      .single()
    if (completed.error) throw completed.error

    return jsonResponse({ purchase: publicPurchase(completed.data as FutureReportPurchaseRow) })
  } catch (error) {
    return errorResponse(error)
  }
}
