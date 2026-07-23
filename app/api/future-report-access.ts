/**
 * [INPUT]: Authenticated POST { reportInput:{ birth, persona } }
 * [OUTPUT]: The signed-in user's latest verified Future Report entitlement/report
 * [POS]: Recovery API used after refresh, Start Over, or a failed generation
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
  rebuildChartIdentity,
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
      || Object.keys(body).length !== 1
      || !Object.prototype.hasOwnProperty.call(body, 'reportInput')
    ) {
      throw new HttpError(
        'Access request contains unsupported fields.',
        400,
        'INVALID_REPORT_INPUT',
      )
    }
    const identity = await rebuildChartIdentity(body.reportInput)
    const chartFingerprint = identity.chartFingerprint
    const admin = getSupabaseAdmin()
    const result = await admin
      .from(FUTURE_REPORT_TABLE)
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_status', 'completed')
      .eq('chart_fingerprint', chartFingerprint)
      .order('payment_completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (result.error) throw result.error

    if (result.data) {
      const purchase = result.data as FutureReportPurchaseRow
      assertTrustedGenerationInput(
        purchase.generation_input,
        purchase.tier,
        purchase.chart_fingerprint,
      )
      return jsonResponse({
        purchase: publicPurchase(purchase),
        chartFingerprint,
      })
    }

    // PayPal can complete the capture while the final database write is lost.
    // A read-only PayPal re-fetch repairs that split-brain state without asking
    // the buyer to approve or pay again.
    const pendingResult = await admin
      .from(FUTURE_REPORT_TABLE)
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_status', 'capture_pending')
      .eq('chart_fingerprint', chartFingerprint)
      .not('paypal_order_id', 'is', null)
      .not('generation_input', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pendingResult.error) throw pendingResult.error
    if (!pendingResult.data) {
      return jsonResponse({ purchase: null, chartFingerprint })
    }

    const pending = pendingResult.data as FutureReportPurchaseRow
    assertTrustedGenerationInput(
      pending.generation_input,
      pending.tier,
      pending.chart_fingerprint,
    )
    let verified
    try {
      verified = await getPayPalServerClient().retrieveAndVerifyOrder(
        pending.paypal_order_id!,
        expectedOrder(pending),
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'PayPal order is not completed.') {
        return jsonResponse({ purchase: null, chartFingerprint })
      }
      throw error
    }

    const repaired = await admin
      .from(FUTURE_REPORT_TABLE)
      .update({
        paypal_capture_id: verified.captureId,
        payment_status: 'completed',
        payment_completed_at: new Date().toISOString(),
      })
      .eq('id', pending.id)
      .eq('user_id', user.id)
      .eq('payment_status', 'capture_pending')
      .select('*')
      .single()
    if (repaired.error) throw repaired.error

    return jsonResponse({
      purchase: publicPurchase(repaired.data as FutureReportPurchaseRow),
      chartFingerprint,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
