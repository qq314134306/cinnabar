import { describe, expect, it } from 'vitest'
import { isValidEmail } from './email'

describe('account email validation', () => {
  it('accepts a trimmed conventional email address', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true)
  })

  it.each([
    '',
    'user',
    'user@example',
    '@example.com',
    'user @example.com',
  ])('rejects invalid input %j', (value) => {
    expect(isValidEmail(value)).toBe(false)
  })
})
