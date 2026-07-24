import { afterEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import authHandler from '../api/auth'

const __dirname = dirname(fileURLToPath(import.meta.url))
const apiRoot = resolve(__dirname, '../api')

function deployableFunctionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return deployableFunctionFiles(path)
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.startsWith('_')) {
      return []
    }
    return [relative(apiRoot, path).replaceAll('\\', '/')]
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Vercel Hobby function budget', () => {
  it('keeps every public API route within the 12-function deployment limit', () => {
    expect(deployableFunctionFiles(apiRoot).sort()).toEqual([
      'auth.ts',
      'credits/account.ts',
      'credits/catalog.ts',
      'cron/paypal-reconciliation.ts',
      'csp-report.ts',
      'future-report-access.ts',
      'future-report-capture.ts',
      'future-report-generate.ts',
      'future-report-order.ts',
      'interpret.ts',
      'paypal-webhook.ts',
    ])
  })

  it('rewrites all one-segment public auth paths into the single auth function', () => {
    const config = JSON.parse(
      readFileSync(resolve(__dirname, '../vercel.json'), 'utf8'),
    )
    expect(config.rewrites).toContainEqual({
      source: '/api/auth/:route',
      destination: '/api/auth?__cinnabar_auth_route=:route',
    })
  })

  it('serves one-segment learning slugs from static HTML files', () => {
    const config = JSON.parse(
      readFileSync(resolve(__dirname, '../vercel.json'), 'utf8'),
    )
    expect(config.rewrites).toContainEqual({
      source: '/learn/:slug',
      destination: '/learn/:slug.html',
    })
  })

  it('uses Node runtimes for work that can exceed the Edge first-response window', () => {
    const config = JSON.parse(
      readFileSync(resolve(__dirname, '../vercel.json'), 'utf8'),
    )
    expect(config.functions).toMatchObject({
      'api/interpret.ts': {
        maxDuration: 300,
        supportsCancellation: true,
      },
      'api/future-report-generate.ts': { maxDuration: 90 },
      'api/future-report-order.ts': { maxDuration: 60 },
      'api/future-report-capture.ts': { maxDuration: 60 },
      'api/future-report-access.ts': { maxDuration: 60 },
      'api/paypal-webhook.ts': { maxDuration: 120 },
      'api/cron/paypal-reconciliation.ts': { maxDuration: 300 },
    })

    for (const route of [
      '../api/interpret.ts',
      '../api/future-report-generate.ts',
      '../api/future-report-order.ts',
      '../api/future-report-capture.ts',
      '../api/future-report-access.ts',
      '../api/paypal-webhook.ts',
      '../api/cron/paypal-reconciliation.ts',
    ]) {
      expect(readFileSync(resolve(__dirname, route), 'utf8')).toContain(
        "runtime: 'nodejs'",
      )
    }
  })

  it('restores the exact public URL before dispatching a rewritten auth request', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://cinnabar.example')
    vi.stubEnv('AUTH_MODE', 'opaque')

    const response = await authHandler(new Request(
      'https://cinnabar.example/api/auth?__cinnabar_auth_route=login-preflight',
    ))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      authMode: 'opaque',
      csrfToken: expect.any(String),
    })
  })

  it('rejects unknown, nested, or ambiguous auth routes', async () => {
    const requests = [
      new Request('https://cinnabar.example/api/auth/unknown'),
      new Request('https://cinnabar.example/api/auth/constructor'),
      new Request('https://cinnabar.example/api/auth/toString'),
      new Request(
        'https://cinnabar.example/api/auth?__cinnabar_auth_route=__proto__',
      ),
      new Request('https://cinnabar.example/api/auth/session/nested'),
      new Request(
        'https://cinnabar.example/api/auth?__cinnabar_auth_route=session&__cinnabar_auth_route=logout',
      ),
    ]

    for (const request of requests) {
      const response = await authHandler(request)
      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({
        error: { code: 'NOT_FOUND', message: 'Not Found' },
      })
    }
  })
})
