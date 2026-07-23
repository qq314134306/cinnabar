import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import cspReportHandler from '../api/csp-report'

describe('security headers contract', () => {
  it('ships report-only CSP without an inline-script exception', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as {
      headers: Array<{ headers: Array<{ key: string; value: string }> }>
    }
    const headers = Object.fromEntries(
      config.headers[0].headers.map(({ key, value }) => [key, value]),
    )

    expect(headers['Content-Security-Policy-Report-Only']).toContain("default-src 'self'")
    expect(headers['Content-Security-Policy-Report-Only']).toContain('report-uri /api/csp-report')
    expect(headers['Content-Security-Policy-Report-Only']).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Permissions-Policy']).toContain('camera=()')
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000')
  })

  it('keeps analytics bootstrap out of index.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    expect(html).not.toContain('window.dataLayer =')
    expect(html).not.toContain('<script async src="https://www.googletagmanager.com')
  })
})

describe('CSP report endpoint', () => {
  it('logs only sanitized host-level report fields', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const response = await cspReportHandler(new Request('https://example.test/api/csp-report', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '203.0.113.7',
        'content-type': 'application/csp-report',
      },
      body: JSON.stringify({
        'csp-report': {
          'effective-directive': 'script-src-elem',
          'blocked-uri': 'https://tracker.example/path?email=secret@example.com',
          'document-uri': 'https://cinnabar.example/chart?birth=private',
          sample: 'sensitive script content',
        },
      }),
    }))

    expect(response.status).toBe(204)
    expect(warn).toHaveBeenCalledWith('csp_violation', {
      directive: 'script-src-elem',
      blockedHost: 'tracker.example',
      documentHost: 'cinnabar.example',
      disposition: undefined,
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret@example.com')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private')
    warn.mockRestore()
  })

  it('accepts Reporting API arrays and discards unsupported fields', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const response = await cspReportHandler(new Request('https://example.test/api/csp-report', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '203.0.113.8',
        'content-type': 'application/reports+json',
      },
      body: JSON.stringify([{
        type: 'csp-violation',
        body: {
          effectiveDirective: 'connect-src',
          blockedURL: 'https://api.example/path?token=secret',
          documentURL: 'https://cinnabar.example/private',
          sourceFile: 'https://cinnabar.example/user-name.js',
          disposition: 'report',
        },
      }]),
    }))

    expect(response.status).toBe(204)
    expect(warn).toHaveBeenCalledWith('csp_violation', {
      directive: 'connect-src',
      blockedHost: 'api.example',
      documentHost: 'cinnabar.example',
      disposition: 'report',
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('token=secret')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('user-name.js')
    warn.mockRestore()
  })

  it('rejects unsupported methods, empty bodies, and invalid JSON', async () => {
    const methodResponse = await cspReportHandler(new Request(
      'https://example.test/api/csp-report',
      { method: 'GET' },
    ))
    expect(methodResponse.status).toBe(405)
    expect(methodResponse.headers.get('allow')).toBe('POST')

    const emptyResponse = await cspReportHandler(new Request(
      'https://example.test/api/csp-report',
      {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.9' },
      },
    ))
    expect(emptyResponse.status).toBe(400)

    const invalidResponse = await cspReportHandler(new Request(
      'https://example.test/api/csp-report',
      {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.10' },
        body: '{',
      },
    ))
    expect(invalidResponse.status).toBe(400)
  })

  it('rejects oversized bodies before parsing, with or without a declared length', async () => {
    const declaredResponse = await cspReportHandler(new Request(
      'https://example.test/api/csp-report',
      {
        method: 'POST',
        headers: {
          'x-forwarded-for': '203.0.113.11',
          'content-length': '16001',
        },
        body: '{}',
      },
    ))
    expect(declaredResponse.status).toBe(413)

    const streamedResponse = await cspReportHandler(new Request(
      'https://example.test/api/csp-report',
      {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.12' },
        body: 'x'.repeat(16_001),
      },
    ))
    expect(streamedResponse.status).toBe(413)
  })

  it('rate limits repeated reports without reading additional bodies', async () => {
    const ip = '203.0.113.13'
    for (let index = 0; index < 20; index += 1) {
      const response = await cspReportHandler(new Request(
        'https://example.test/api/csp-report',
        {
          method: 'POST',
          headers: { 'x-forwarded-for': ip },
          body: '{}',
        },
      ))
      expect(response.status).toBe(204)
    }

    const limitedResponse = await cspReportHandler(new Request(
      'https://example.test/api/csp-report',
      {
        method: 'POST',
        headers: { 'x-forwarded-for': ip },
        body: JSON.stringify({ secret: 'must-not-be-read' }),
      },
    ))
    expect(limitedResponse.status).toBe(429)
    expect(limitedResponse.headers.get('retry-after')).toBe('60')
  })
})
