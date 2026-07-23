/**
 * [INPUT]: Authenticated user/session version and the sanitized credit account API
 * [OUTPUT]: Header balance entry and an isolated, accessible activity dialog
 * [POS]: Account credit wallet UI, mounted only for signed-in users
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { analytics } from '@/lib/analytics'
import {
  formatCreditAmount,
  formatCreditDate,
  getCreditActionLabel,
  loadCreditWallet,
  type CreditWalletData,
} from '@/lib/credits'

type WalletStatus = 'loading' | 'ready' | 'error'

interface CreditWalletProps {
  userId: string
  sessionVersion: string
  legacyAccessToken?: string | null
}

interface CreditWalletContentProps {
  status: WalletStatus
  data: CreditWalletData | null
  onRetry: () => void
}

export function CreditWalletContent({
  status,
  data,
  onRetry,
}: CreditWalletContentProps) {
  if (status === 'loading' && !data) {
    return (
      <div className="py-10 text-center" role="status" aria-live="polite">
        <span
          className="mx-auto mb-3 block h-6 w-6 animate-spin rounded-full border-2 border-gold/25 border-t-gold"
          aria-hidden
        />
        <p className="text-sm text-text-muted">Loading your credits…</p>
      </div>
    )
  }

  if (status === 'error' || !data) {
    return (
      <div
        className="rounded-xl border border-misfortune/20 bg-misfortune/10 p-4 text-center"
        role="alert"
      >
        <p className="text-sm font-medium text-text">Credits are temporarily unavailable.</p>
        <p className="mt-1 text-xs leading-5 text-text-muted">
          Your account and readings still work. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="
            mt-3 rounded-lg border border-white/[0.1] bg-white/[0.05]
            px-3 py-2 text-xs font-semibold text-text-secondary
            transition-colors hover:bg-white/[0.09] hover:text-text
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold
          "
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-gold/20 bg-gold/[0.07] p-4">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          Current balance
        </p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums text-gold">
            {data.balance}
          </span>
          <span className="text-sm text-text-secondary">credits</span>
        </p>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-text">Recent activity</h3>
        {data.transactions.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-text-muted">No credit activity yet.</p>
            <p className="mt-1 text-xs text-text-muted/75">
              New credits and future uses will appear here.
            </p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-white/[0.07]">
            {data.transactions.map((transaction) => (
              <li
                key={transaction.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-secondary">
                    {getCreditActionLabel(transaction.entryType)}
                  </p>
                  <time
                    dateTime={transaction.createdAt}
                    className="mt-0.5 block text-xs text-text-muted"
                  >
                    {formatCreditDate(transaction.createdAt)}
                  </time>
                </div>
                <span
                  className={`
                    self-center text-sm font-semibold tabular-nums
                    ${transaction.amount >= 0 ? 'text-fortune' : 'text-misfortune'}
                  `}
                  aria-label={`${transaction.amount >= 0 ? 'Added' : 'Deducted'} ${Math.abs(transaction.amount)} credits`}
                >
                  {formatCreditAmount(transaction.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function CreditWalletSession({
  legacyAccessToken,
}: Pick<CreditWalletProps, 'legacyAccessToken'>) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<WalletStatus>('loading')
  const [data, setData] = useState<CreditWalletData | null>(null)
  const requestIdRef = useRef(0)
  const returnFocusRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const dialogId = useId()
  const titleId = `${dialogId}-title`

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setStatus('loading')

    try {
      const wallet = legacyAccessToken
        ? await loadCreditWallet(fetch, legacyAccessToken)
        : await loadCreditWallet()
      if (requestId !== requestIdRef.current) return
      setData(wallet)
      setStatus('ready')
    } catch {
      if (requestId !== requestIdRef.current) return
      setData(null)
      setStatus('error')
    }
  }, [legacyAccessToken])

  const closeWallet = useCallback(() => {
    returnFocusRef.current = true
    setOpen(false)
  }, [])

  useEffect(() => {
    const requestId = ++requestIdRef.current
    const request = legacyAccessToken
      ? loadCreditWallet(fetch, legacyAccessToken)
      : loadCreditWallet()
    request
      .then((wallet) => {
        if (requestId !== requestIdRef.current) return
        setData(wallet)
        setStatus('ready')
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setData(null)
        setStatus('error')
      })

    return () => {
      requestIdRef.current += 1
    }
  }, [legacyAccessToken])

  useEffect(() => {
    if (!open) return

    const appRoot = document.getElementById('root')
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null
    const previouslyInert = appRoot?.hasAttribute('inert') ?? false
    const previousOverflow = document.body.style.overflow
    const trigger = triggerRef.current

    appRoot?.setAttribute('aria-hidden', 'true')
    appRoot?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeWallet()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    closeRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow

      if (appRoot) {
        if (previousAriaHidden === null) appRoot.removeAttribute('aria-hidden')
        else appRoot.setAttribute('aria-hidden', previousAriaHidden)

        if (previouslyInert) appRoot.setAttribute('inert', '')
        else appRoot.removeAttribute('inert')
      }

      if (returnFocusRef.current) {
        returnFocusRef.current = false
        trigger?.focus()
      }
    }
  }, [closeWallet, open])

  const openWallet = () => {
    if (open) return
    returnFocusRef.current = false
    setOpen(true)
    analytics.viewWallet()
    if (status === 'ready') void refresh()
  }

  const dialog = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="
            fixed inset-0 z-50 flex items-end justify-center
            bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4
          "
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeWallet()
          }}
        >
          <section
            ref={dialogRef}
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="
              max-h-[85vh] w-full overflow-y-auto rounded-t-2xl
              border border-white/[0.09] bg-night-light p-5
              shadow-[0_-10px_40px_rgba(0,0,0,0.45)]
              sm:max-w-md sm:rounded-2xl sm:p-6
            "
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold/75">
                  Cinnabar account
                </p>
                <h2
                  id={titleId}
                  className="mt-1 text-xl font-semibold text-text"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  Your credits
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={closeWallet}
                aria-label="Close credits wallet"
                className="
                  inline-flex h-9 w-9 shrink-0 items-center justify-center
                  rounded-full text-xl leading-none text-text-muted
                  transition-colors hover:bg-white/[0.06] hover:text-text
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold
                "
              >
                ×
              </button>
            </div>

            <CreditWalletContent
              status={status}
              data={data}
              onRetry={() => void refresh()}
            />
          </section>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openWallet}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-busy={status === 'loading'}
        aria-controls={open ? dialogId : undefined}
        aria-label={
          data
            ? `Credits wallet, ${data.balance} credits`
            : 'Open credits wallet'
        }
        className="
          inline-flex min-h-9 items-center justify-center rounded-xl
          border border-gold/20 bg-gold/[0.07] px-2.5
          text-xs font-semibold text-gold transition-colors
          hover:border-gold/30 hover:bg-gold/[0.12]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold
        "
      >
        {data ? (
          <>
            <span className="tabular-nums">{data.balance}</span>
            <span className="ml-1 hidden sm:inline">credits</span>
            <span className="sr-only sm:hidden"> credits</span>
          </>
        ) : (
          'Credits'
        )}
      </button>
      {dialog}
    </>
  )
}

export function CreditWallet({
  userId,
  sessionVersion,
  legacyAccessToken = null,
}: CreditWalletProps) {
  return (
    <CreditWalletSession
      key={`${userId}:${sessionVersion}`}
      legacyAccessToken={legacyAccessToken}
    />
  )
}
