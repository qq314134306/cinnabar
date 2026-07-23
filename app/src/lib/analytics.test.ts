import { afterEach, describe, expect, it, vi } from 'vitest'
import { analytics } from '@/lib/analytics'

describe('wallet analytics', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends view_wallet without user or account parameters', () => {
    const gtag = vi.fn()
    vi.stubGlobal('window', { gtag })

    analytics.viewWallet()

    expect(gtag).toHaveBeenCalledOnce()
    expect(gtag).toHaveBeenCalledWith('event', 'view_wallet')
  })
})
