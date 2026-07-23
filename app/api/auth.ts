/**
 * [INPUT]: Existing /api/auth/* request routed through the Vercel rewrite
 * [OUTPUT]: The exact auth endpoint response with the original public URL
 * [POS]: Single deployable auth function for the Vercel Hobby function budget
 */

import callbackHandler from './_auth-route-callback'
import emailConfirmHandler from './_auth-route-email-confirm'
import loginEmailHandler from './_auth-route-login-email'
import loginEmailVerifyHandler from './_auth-route-login-email-verify'
import loginOAuthHandler from './_auth-route-login-oauth'
import loginPreflightHandler from './_auth-route-login-preflight'
import logoutHandler from './_auth-route-logout'
import migrateHandler from './_auth-route-migrate'
import sessionHandler from './_auth-route-session'
import { authJson } from './_auth-http'

export const config = { runtime: 'edge' }

const ROUTE_PARAMETER = '__cinnabar_auth_route'

type AuthHandler = (req: Request) => Promise<Response> | Response

const handlers: Readonly<Record<string, AuthHandler>> = Object.freeze({
  callback: callbackHandler,
  'email-confirm': emailConfirmHandler,
  'login-email': loginEmailHandler,
  'login-email-verify': loginEmailVerifyHandler,
  'login-oauth': loginOAuthHandler,
  'login-preflight': loginPreflightHandler,
  logout: logoutHandler,
  migrate: migrateHandler,
  session: sessionHandler,
})

function readRoute(url: URL): string | null {
  const routedValues = url.searchParams.getAll(ROUTE_PARAMETER)
  if (routedValues.length === 1 && Object.hasOwn(handlers, routedValues[0])) {
    return routedValues[0]
  }
  const prefix = '/api/auth/'
  if (
    routedValues.length === 0
    && url.pathname.startsWith(prefix)
    && !url.pathname.slice(prefix.length).includes('/')
  ) {
    const route = url.pathname.slice(prefix.length)
    return Object.hasOwn(handlers, route) ? route : null
  }
  return null
}

function restorePublicRequest(req: Request, route: string): Request {
  const url = new URL(req.url)
  const expectedPath = `/api/auth/${route}`
  const needsRestore = (
    url.pathname !== expectedPath
    || url.searchParams.has(ROUTE_PARAMETER)
  )
  if (!needsRestore) return req

  url.pathname = expectedPath
  url.searchParams.delete(ROUTE_PARAMETER)
  return new Request(url, req)
}

export default function handler(req: Request): Promise<Response> | Response {
  const route = readRoute(new URL(req.url))
  if (!route) {
    return authJson(
      { error: { code: 'NOT_FOUND', message: 'Not Found' } },
      404,
    )
  }
  return handlers[route](restorePublicRequest(req, route))
}
