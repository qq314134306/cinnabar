/* ============================================================
   Cinnabar — main entry
   Eastern Astrology, in English.
   ============================================================ */

import { useEffect, useState, type ReactNode } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { BirthForm } from '@/components/BirthForm'
import { ChartDisplay } from '@/components/chart'
import { AIInterpretation } from '@/components/AIInterpretation'
import { MatchAnalysis } from '@/components/match'
import { GitHubLinkButton, OpenSourceFooterLinks } from '@/components/OpenSourceLinks'
import { ShareCard } from '@/components/share'
import { ExitIntentModal } from '@/components/ExitIntentModal'
import { AuthControl } from '@/components/AuthControl'
import { useChartStore, useAuthStore } from '@/stores'
import { trackPageView } from '@/lib/analytics'

type TabType = 'chart' | 'match' | 'share'

const TABS: Array<{ key: TabType; label: string; icon: ReactNode }> = [
  { key: 'chart', label: 'Your Chart', icon: '☰' },
  { key: 'match', label: 'Compatibility', icon: '⚭' },
  { key: 'share', label: 'Share Card', icon: '◈' },
]

/** Virtual SPA routes reported to GA4 on each tab change. */
const TAB_ROUTES: Record<TabType, { path: string; title: string }> = {
  chart: { path: '/', title: 'Cinnabar — Your Chart' },
  match: { path: '/compatibility', title: 'Cinnabar — Compatibility' },
  share: { path: '/share-card', title: 'Cinnabar — Share Card' },
}

export default function App() {
  const { chart } = useChartStore()
  const initAuth = useAuthStore((s) => s.init)
  const [activeTab, setActiveTab] = useState<TabType>('chart')

  // Hydrate the Supabase session + bind the auth listener once.
  useEffect(() => {
    initAuth()
  }, [initAuth])

  // Report a page_view on first load and on every tab change (the SPA has no
  // router, so tabs are our virtual routes).
  useEffect(() => {
    const route = TAB_ROUTES[activeTab]
    trackPageView(route.path, route.title)
  }, [activeTab])

  return (
    <div className="min-h-screen flex flex-col">
      {/* Aurora background */}
      <div className="aurora-bg" />
      {/* Star field background */}
      <div className="star-bg" />

      {/* Header — glass navigation */}
      <header
        className="
          sticky top-0 z-40
          py-4 px-6 lg:px-12
          bg-night/80 backdrop-blur-xl
          border-b border-white/[0.06]
        "
      >
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          {/* Logo + nav */}
          <div className="flex items-center gap-10">
            {/* Logo */}
            <div className="flex items-center gap-3">
              {/* Seal mark */}
              <div
                className="
                  relative w-10 h-10 rounded-xl
                  bg-gradient-to-br from-cinnabar to-cinnabar-dark
                  border border-white/[0.1]
                  flex items-center justify-center
                  shadow-[0_0_20px_rgba(178,58,46,0.35)]
                "
              >
                <span className="text-lg text-gold">☆</span>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/10 to-transparent animate-pulse" />
              </div>
              {/* Wordmark */}
              <div>
                <h1
                  className="
                    text-xl font-bold tracking-wide
                    bg-gradient-to-r from-gold via-gold-light to-gold
                    bg-clip-text text-transparent
                    bg-[length:200%_auto] animate-[shimmer_4s_ease-in-out_infinite]
                  "
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  Cinnabar
                </h1>
                <p className="text-text-muted text-xs hidden sm:block">
                  Eastern Astrology, in English
                </p>
              </div>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    group relative px-4 py-2 rounded-lg
                    text-sm font-medium transition-all duration-200
                    ${activeTab === tab.key
                      ? 'text-text'
                      : 'text-text-muted hover:text-text-secondary'
                    }
                  `}
                >
                  <span
                    className={`
                      absolute inset-0 rounded-lg transition-all duration-200
                      ${activeTab === tab.key
                        ? 'bg-white/[0.08]'
                        : 'group-hover:bg-white/[0.04]'
                      }
                    `}
                  />
                  <span className="relative flex items-center gap-2">
                    <span className={`
                      inline-flex h-4 w-4 items-center justify-center text-xs transition-all duration-200
                      ${activeTab === tab.key ? 'text-gold' : 'opacity-50 group-hover:opacity-70'}
                    `}>
                      {tab.icon}
                    </span>
                    {tab.label}
                  </span>
                  <span
                    className={`
                      absolute -bottom-1 left-1/2 -translate-x-1/2
                      h-0.5 rounded-full
                      bg-gradient-to-r from-cinnabar via-gold to-cinnabar
                      transition-all duration-300
                      ${activeTab === tab.key ? 'w-2/3 opacity-100' : 'w-0 opacity-0'}
                    `}
                  />
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <AuthControl />
            <GitHubLinkButton />
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav
        className="
          md:hidden fixed bottom-0 left-0 right-0 z-40
          px-4 py-3
          bg-night/90 backdrop-blur-xl
          border-t border-white/[0.06]
        "
      >
        <div className="flex justify-around max-w-md mx-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex flex-col items-center gap-1 px-4 py-1.5 rounded-lg
                transition-all duration-200
                ${activeTab === tab.key
                  ? 'text-gold'
                  : 'text-text-muted'
                }
              `}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center text-base">{tab.icon}</span>
              <span className="text-xs">{tab.label}</span>
              {activeTab === tab.key && (
                <span className="absolute -top-1 w-1 h-1 rounded-full bg-gold shadow-[0_0_6px_rgba(212,175,55,0.6)]" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 px-4 lg:px-12 py-8 pb-24 md:pb-8">
        <div className="max-w-[1600px] mx-auto">
          {/* Your Chart tab */}
          {activeTab === 'chart' && (
            !chart ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <BirthForm />
              </div>
            ) : (
              <div className="animate-fade-in space-y-8">
                <div className="w-full">
                  <ChartDisplay />
                </div>

                <div className="w-full max-w-6xl mx-auto">
                  <AIInterpretation />
                </div>

                <div className="text-center">
                  <button
                    onClick={() => useChartStore.getState().clear()}
                    className="
                      inline-flex items-center gap-2 px-4 py-2 rounded-lg
                      text-sm text-text-muted
                      hover:text-text hover:bg-white/[0.04]
                      transition-all duration-200
                    "
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Start Over
                  </button>
                </div>
              </div>
            )
          )}

          {/* Compatibility tab */}
          {activeTab === 'match' && <MatchAnalysis />}

          {/* Share Card tab */}
          {activeTab === 'share' && (
            !chart ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <EmptyState
                  message="Cast your chart under Your Chart first."
                  action={() => setActiveTab('chart')}
                  actionLabel="Go to Your Chart"
                />
              </div>
            ) : (
              <div className="max-w-xl mx-auto">
                <ShareCard />
              </div>
            )
          )}
        </div>
      </main>

      {/* Footer — desktop only */}
      <footer
        className="
          hidden md:block
          py-6 text-center text-text-muted text-xs
          border-t border-white/[0.04]
          space-y-1.5
        "
      >
        <p className="flex items-center justify-center gap-2">
          <span className="text-gold/60">☆</span>
          Cinnabar · Eastern Astrology, in English · <OpenSourceFooterLinks />
          <span className="text-cinnabar/70">☆</span>
        </p>
        <p>For entertainment &amp; self-discovery only. Not professional advice.</p>
        <p>Chart engine based on the open-source ziwei project (GPLv3).</p>
      </footer>

      {/* Exit-intent email capture (once per session, desktop leave signal) */}
      <ExitIntentModal />

      <Analytics />
    </div>
  )
}

/* ------------------------------------------------------------
   Empty state
   ------------------------------------------------------------ */

interface EmptyStateProps {
  message: string
  action: () => void
  actionLabel: string
}

function EmptyState({ message, action, actionLabel }: EmptyStateProps) {
  return (
    <div
      className="
        text-center p-8 rounded-2xl
        bg-white/[0.02] border border-white/[0.06]
      "
    >
      <div className="text-4xl mb-4 opacity-30">☆</div>
      <p className="text-text-muted mb-4">{message}</p>
      <button
        onClick={action}
        className="
          inline-flex items-center gap-2
          px-4 py-2 rounded-lg
          bg-cinnabar/20 text-cinnabar-light
          hover:bg-cinnabar/30 transition-colors
        "
      >
        {actionLabel}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </button>
    </div>
  )
}
