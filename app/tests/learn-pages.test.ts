import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pagePath = resolve(
  __dirname,
  '../public/learn/what-is-zi-wei-dou-shu.html',
)
const sitemapPath = resolve(__dirname, '../public/sitemap.xml')
const robotsPath = resolve(__dirname, '../public/robots.txt')
const canonicalUrl =
  'https://cinnabarastrology.com/learn/what-is-zi-wei-dou-shu'

function readPage(): string {
  return readFileSync(pagePath, 'utf8')
}

function articleWordCount(html: string): number {
  const article = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? ''
  return article
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

describe('static learning pages', () => {
  it('ships an indexable, structured first article at the canonical URL', () => {
    const html = readPage()

    expect(html).toContain('<meta name="viewport"')
    expect(html).toContain(
      '<title>What Is Zi Wei Dou Shu? A Beginner\u2019s Guide | Cinnabar</title>',
    )
    expect(html).toMatch(
      new RegExp(
        `<link\\s+rel="canonical"\\s+href="${canonicalUrl}"\\s*/>`,
      ),
    )
    expect(html).toMatch(
      new RegExp(
        `<meta\\s+property="og:url"\\s+content="${canonicalUrl}"\\s*/>`,
      ),
    )
    expect(html).toContain('<meta property="og:type" content="article" />')
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html.match(/<h2\b/g)?.length).toBeGreaterThanOrEqual(4)
    expect(articleWordCount(html)).toBeGreaterThanOrEqual(400)
    expect(articleWordCount(html)).toBeLessThanOrEqual(800)
    expect(html).toContain('href="/"')
    expect(html).toContain('Cast Your Free Chart')
    expect(html).toContain(
      'For entertainment &amp; self-discovery only. Not professional advice.',
    )
  })

  it('keeps the public article inside the approved claim vocabulary', () => {
    const html = readPage().toLowerCase()

    expect(html).not.toMatch(/\bdivination\b/)
    expect(html).not.toMatch(/\bfortune\b/)
    expect(html).not.toContain('<script')
  })

  it('publishes crawler discovery files for the article', () => {
    const sitemap = readFileSync(sitemapPath, 'utf8')
    const robots = readFileSync(robotsPath, 'utf8')

    expect(sitemap).toContain(`<loc>${canonicalUrl}</loc>`)
    expect(robots).toContain(
      'Sitemap: https://cinnabarastrology.com/sitemap.xml',
    )
  })
})
