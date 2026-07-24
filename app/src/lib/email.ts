/**
 * Shared email syntax check for account authentication forms.
 *
 * Cinnabar no longer collects marketing or visitor-subscription emails. This
 * helper validates only the email address a user explicitly enters while
 * signing in.
 */

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}
