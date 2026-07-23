import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AuthControl sign-out feedback', () => {
  it('catches sign-out failures, disables repeat clicks, and exposes an alert', () => {
    const source = readFileSync(new URL('./AuthControl.tsx', import.meta.url), 'utf8')

    expect(source).toContain('if (signingOut) return')
    expect(source).toContain('disabled={signingOut}')
    expect(source).toContain('catch (error)')
    expect(source).toContain('role="alert"')
  })

  it('renders the stable store-level callback failure beside the sign-in control', () => {
    const source = readFileSync(new URL('./AuthControl.tsx', import.meta.url), 'utf8')

    expect(source).toContain('error: authError')
    expect(source).toContain('{authError}')
  })

  it('offers session retry instead of sign-in while cookie authority is unknown', () => {
    const source = readFileSync(new URL('./AuthControl.tsx', import.meta.url), 'utf8')

    expect(source).toContain("if ((!initialized || !authMode) && authError)")
    expect(source).toContain('onClick={() => void init()}')
    expect(source).toContain('Retry session')
  })
})
