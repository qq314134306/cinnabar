/**
 * [INPUT]: A dollar amount and a DOM container id from the paywall UI
 * [OUTPUT]: Renders PayPal Smart Payment Buttons and resolves the captured order on approval
 * [POS]: Client-only checkout layer used by FutureReportPaywall.tsx
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * This is the standard client-side PayPal integration (createOrder + client-side
 * capture, no server order verification) — appropriate for this MVP. The PayPal
 * client ID is a public identifier (like a Stripe publishable key), safe to ship
 * in the bundle; it is never paired with a secret on the client.
 */

const DEFAULT_CLIENT_ID = 'AXDWxBO5QCM62D3Cl9LJMbLpCLwDNmF7kyLLRniNhrlsjVtPjSDU05-ax8wkdFhua_7pgrgnUi9vbEQl'
const PAYPAL_CLIENT_ID = (import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined) || DEFAULT_CLIENT_ID

interface PayPalOrderDetails {
  id: string
  status: string
}

interface PayPalActions {
  order: {
    create: (config: unknown) => Promise<string>
    capture: () => Promise<PayPalOrderDetails>
  }
}

interface PayPalButtonsInstance {
  isEligible: () => boolean
  render: (selector: string) => Promise<void>
  close?: () => void
}

interface PayPalButtonsConfig {
  style?: Record<string, string>
  createOrder: (data: unknown, actions: PayPalActions) => Promise<string>
  onApprove: (data: unknown, actions: PayPalActions) => Promise<void>
  onCancel?: () => void
  onError?: (error: unknown) => void
}

interface PayPalNamespace {
  Buttons: (config: PayPalButtonsConfig) => PayPalButtonsInstance
}

declare global {
  interface Window {
    paypal?: PayPalNamespace
  }
}

let sdkPromise: Promise<PayPalNamespace> | null = null

function loadPayPalSdk(): Promise<PayPalNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('PayPal checkout requires a browser environment.'))
  }
  if (window.paypal) return Promise.resolve(window.paypal)

  sdkPromise ??= new Promise((resolve, reject) => {
    const existing = document.getElementById('paypal-sdk-script')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.paypal!))
      existing.addEventListener('error', () => reject(new Error('Failed to load the PayPal SDK.')))
      return
    }

    const script = document.createElement('script')
    script.id = 'paypal-sdk-script'
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&currency=USD&intent=capture&locale=en_US`
    script.async = true
    script.onload = () => {
      if (window.paypal) resolve(window.paypal)
      else reject(new Error('PayPal SDK loaded but did not initialize.'))
    }
    script.onerror = () => reject(new Error('Failed to load the PayPal SDK.'))
    document.body.appendChild(script)
  })

  return sdkPromise
}

export interface PayPalCheckoutOptions {
  /** Decimal string, e.g. "9.90" */
  amount: string
  /** DOM id of the (empty) container element the buttons render into. */
  containerId: string
  /** Fired when the buyer starts checkout (order creation begins). */
  onInitiate?: () => void
  onApprove: (details: PayPalOrderDetails) => void
  onError: (error: Error) => void
  onCancel?: () => void
}

export interface PayPalCheckoutHandle {
  close: () => void
}

/** Renders Smart Payment Buttons into `containerId`. Safe to call once per mount. */
export async function renderPayPalButtons(options: PayPalCheckoutOptions): Promise<PayPalCheckoutHandle> {
  const paypal = await loadPayPalSdk()

  const buttons = paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' },
    createOrder: (_data, actions) => {
      options.onInitiate?.()
      return actions.order.create({
        purchase_units: [{ amount: { value: options.amount, currency_code: 'USD' } }],
      })
    },
    onApprove: async (_data, actions) => {
      try {
        const details = await actions.order.capture()
        options.onApprove(details)
      } catch (err) {
        options.onError(err instanceof Error ? err : new Error('Payment capture failed.'))
      }
    },
    onCancel: () => options.onCancel?.(),
    onError: (err) => options.onError(err instanceof Error ? err : new Error(String(err))),
  })

  if (!buttons.isEligible()) {
    throw new Error('PayPal Checkout is not available in this browser.')
  }

  await buttons.render(`#${options.containerId}`)
  return { close: () => buttons.close?.() }
}
