/**
 * [INPUT]: Raw PayPal webhook headers/body and PAYPAL_WEBHOOK_ID
 * [OUTPUT]: Fast, idempotent 2xx acknowledgment after official PayPal verification
 * [POS]: Public PayPal webhook endpoint; payment state comes only from PayPal API re-fetches
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import {
  SupabasePayPalPaymentStore,
  RetryablePayPalWebhookError,
  parseVerifiedWebhookEvent,
  processVerifiedPayPalEvent,
  type PayPalPaymentStore,
} from './_paypal-webhook'
import { getPayPalServerClient, type PayPalServerClient } from './_paypal'
import { jsonResponse } from './_require-user'

export const config = { runtime: 'nodejs' }

const MAX_WEBHOOK_BODY_LENGTH = 500_000
const WEBHOOK_ID_RE = /^[A-Za-z0-9]{1,50}$/

type WebhookPayPalClient = Pick<
  PayPalServerClient,
  | 'verifyWebhookSignature'
  | 'retrieveCaptureBinding'
  | 'retrievePaymentState'
  | 'retrieveDisputeCaptureIds'
>

interface PayPalWebhookHandlerDependencies {
  env?: NodeJS.ProcessEnv
  getClient?: () => WebhookPayPalClient
  getStore?: () => PayPalPaymentStore
  now?: () => Date
}

export function createPayPalWebhookHandler(
  dependencies: PayPalWebhookHandlerDependencies = {},
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405)
    }

    const env = dependencies.env ?? process.env
    const webhookId = env.PAYPAL_WEBHOOK_ID
    if (!webhookId || !WEBHOOK_ID_RE.test(webhookId)) {
      return jsonResponse({ error: 'PayPal webhook is not configured.' }, 503)
    }

    const rawBody = await req.text()
    if (!rawBody || rawBody.length > MAX_WEBHOOK_BODY_LENGTH) {
      return jsonResponse({ error: 'Invalid webhook payload.' }, 400)
    }
    let webhookEvent: Record<string, unknown>
    try {
      const parsed = JSON.parse(rawBody) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid')
      }
      webhookEvent = parsed as Record<string, unknown>
    } catch {
      return jsonResponse({ error: 'Invalid webhook payload.' }, 400)
    }

    const client = dependencies.getClient?.() ?? getPayPalServerClient()
    let signatureVerified: boolean
    try {
      // The exact request headers and the event parsed directly from the raw
      // body are sent to PayPal's official verification API.
      signatureVerified = await client.verifyWebhookSignature(
        req.headers,
        webhookEvent,
        webhookId,
      )
    } catch {
      console.error('[paypal-webhook] verification_dependency_failed')
      return jsonResponse({ error: 'Webhook verification unavailable.' }, 503)
    }
    if (!signatureVerified) {
      return jsonResponse({ error: 'Invalid webhook signature.' }, 400)
    }

    const event = parseVerifiedWebhookEvent(webhookEvent)
    if (!event) {
      return jsonResponse({ error: 'Invalid webhook event.' }, 400)
    }

    const store = dependencies.getStore?.() ?? new SupabasePayPalPaymentStore()
    let claimed = false
    try {
      claimed = await store.claimEvent(event.id, event.eventType)
      if (!claimed) {
        return jsonResponse({ received: true })
      }
      const outcome = await processVerifiedPayPalEvent(
        event,
        client,
        store,
        (dependencies.now?.() ?? new Date()).toISOString(),
      )
      await store.finishEvent(
        event.id,
        outcome.deliveryStatus,
        outcome.outcome,
        outcome.resourceId,
      )
      return jsonResponse({ received: true })
    } catch (error) {
      if (claimed) {
        try {
          await store.finishEvent(
            event.id,
            'failed',
            error instanceof RetryablePayPalWebhookError
              ? error.outcome
              : 'processing_error',
            event.resourceId,
          )
        } catch {
          console.error('[paypal-webhook] failed_event_persistence_failed')
        }
      }
      console.error('[paypal-webhook] processing_failed')
      return jsonResponse({ error: 'Webhook processing unavailable.' }, 500)
    }
  }
}

export default createPayPalWebhookHandler()
