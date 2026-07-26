/* ============================================================
   年度运势组件
   基于流年盘分析当年运势
   ============================================================ */

import { useState, useCallback, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChartStore, useContentCacheStore } from '@/stores'
import { streamReading } from '@/lib/llm'
import {
  isPublicAiReadingEnabled,
  PUBLIC_AI_UNAVAILABLE_MESSAGE,
} from '@/lib/public-ai'
import { buildYearlyReadingRequest } from '@/lib/reading-contract'
import { Button, Select } from '@/components/ui'

/* ------------------------------------------------------------
   年份选项
   ------------------------------------------------------------ */

const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: currentYear - 5 + i,
  label: `${currentYear - 5 + i}年`,
}))

/* ------------------------------------------------------------
   Markdown 自定义样式组件
   ------------------------------------------------------------ */

const MarkdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-bold text-gold mt-6 mb-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-semibold text-gold/90 mt-5 mb-2">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-medium text-star-light mt-4 mb-2">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 leading-relaxed">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="text-gold font-semibold">{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-none space-y-1.5 mb-3 pl-4">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside space-y-1.5 mb-3 pl-2">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="relative pl-4 before:content-['◆'] before:absolute before:left-0 before:text-star/60 before:text-xs">
      {children}
    </li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-gold/40 pl-4 my-3 italic text-text-secondary">
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-6 border-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="text-text-muted not-italic">{children}</em>
  ),
}

/* ------------------------------------------------------------
   年度运势组件
   ------------------------------------------------------------ */

export function YearlyFortune() {
  const { chart, birthInfo } = useChartStore()
  const { yearlyFortune, setYearlyFortune } = useContentCacheStore()
  const publicAiEnabled = isPublicAiReadingEnabled()

  const [year, setYear] = useState(currentYear)
  const [fortune, setFortune] = useState(yearlyFortune[currentYear] || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      const controller = requestRef.current
      requestRef.current = null
      controller?.abort()
    }
  }, [])

  // 切换年份时加载缓存
  const handleYearChange = useCallback((newYear: number) => {
    requestRef.current?.abort()
    requestRef.current = null
    setLoading(false)
    setYear(newYear)
    setFortune(yearlyFortune[newYear] || '')
  }, [yearlyFortune])

  const handleAnalyze = useCallback(async () => {
    if (!publicAiEnabled || !chart || !birthInfo) return

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    setLoading(true)
    setError(null)
    setFortune('')

    try {
      const request = buildYearlyReadingRequest(birthInfo, year)
      let fullText = ''
      for await (const token of streamReading(request, { signal: controller.signal })) {
        if (requestRef.current !== controller) return
        fullText += token
        setFortune(fullText)
      }

      if (requestRef.current !== controller) return
      // 保存到全局缓存
      setYearlyFortune(year, fullText)
    } catch (err) {
      if (controller.signal.aborted || requestRef.current !== controller) return
      setError(err instanceof Error ? err.message : '分析失败，请重试')
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [chart, birthInfo, publicAiEnabled, year, setYearlyFortune])

  if (!chart) return null

  if (!publicAiEnabled) {
    return (
      <div
        className="
          animate-fade-in relative p-6 lg:p-8 max-w-6xl mx-auto
          bg-gradient-to-br from-white/[0.04] to-transparent
          backdrop-blur-xl border border-white/[0.08] rounded-2xl
          shadow-[0_8px_32px_rgba(0,0,0,0.3)]
        "
      >
        <h2
          className="text-xl lg:text-2xl font-semibold text-gold mb-4"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Yearly Reading
        </h2>
        <div
          role="status"
          className="rounded-lg border border-gold/20 bg-gold/5 p-4 text-sm text-text-secondary"
        >
          {PUBLIC_AI_UNAVAILABLE_MESSAGE}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-8 max-w-6xl mx-auto">
      {/* 顶部：年份选择控制面板 */}
      <div
        className="
          relative p-6 lg:p-8
          bg-gradient-to-br from-white/[0.04] to-transparent
          backdrop-blur-xl border border-white/[0.08] rounded-2xl
          shadow-[0_8px_32px_rgba(0,0,0,0.3)]
        "
      >
        {/* 顶部发光线 */}
        <div
          className="
            absolute top-0 left-1/2 -translate-x-1/2
            w-1/3 h-px
            bg-gradient-to-r from-transparent via-gold/50 to-transparent
          "
        />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2
            className="
              text-xl lg:text-2xl font-semibold
              bg-gradient-to-r from-gold via-gold-light to-gold
              bg-clip-text text-transparent
            "
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            年度运势
          </h2>

          <div className="flex items-center gap-4">
            <Select
              options={YEAR_OPTIONS}
              value={year}
              onChange={(e) => handleYearChange(Number(e.target.value))}
            />

            <Button
              onClick={handleAnalyze}
              disabled={loading}
              size="sm"
              variant="gold"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-night border-t-transparent rounded-full animate-spin" />
                  分析中
                </span>
              ) : '查看运势'}
            </Button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-misfortune/10 text-misfortune text-sm border border-misfortune/20">
            {error}
          </div>
        )}
      </div>

      {/* 下方：运势内容 */}
      <div
        className="
          relative p-6 lg:p-8
          bg-gradient-to-br from-white/[0.04] to-transparent
          backdrop-blur-xl border border-white/[0.08] rounded-2xl
          shadow-[0_8px_32px_rgba(0,0,0,0.3)]
        "
      >
        {/* 顶部发光线 */}
        <div
          className="
            absolute top-0 left-1/2 -translate-x-1/2
            w-1/3 h-px
            bg-gradient-to-r from-transparent via-star/50 to-transparent
          "
        />

        {/* 未分析提示 */}
        {!fortune && !loading && (
          <div className="text-text-muted text-sm py-8 text-center">
            <div className="text-3xl mb-3 opacity-30">◎</div>
            选择年份并点击「查看运势」开始分析
          </div>
        )}

        {/* 加载中 */}
        {loading && !fortune && (
          <div className="flex items-center justify-center gap-3 text-text-muted py-12">
            <div className="w-5 h-5 border-2 border-star border-t-transparent rounded-full animate-spin" />
            <span>正在分析 {year} 年运势...</span>
          </div>
        )}

        {/* 运势内容 - 书法字体 + Markdown 渲染 */}
        {fortune && (
          <div
            className="
              prose prose-invert max-w-none
              text-text-secondary text-lg lg:text-xl leading-loose
            "
            style={{ fontFamily: 'var(--font-brush)' }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MarkdownComponents}
            >
              {fortune}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
