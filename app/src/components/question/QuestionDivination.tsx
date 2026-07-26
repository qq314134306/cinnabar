import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  calculateQuestionCharts,
  createQuestionEvent,
  type FactResult,
} from '@/lib/question-divination'

const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function QuestionDivination() {
  const [question, setQuestion] = useState('')
  const [capturedAt, setCapturedAt] = useState(() => localDateTimeValue(new Date()))
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [location, setLocation] = useState('')
  const [error, setError] = useState('')
  const [chart, setChart] = useState<ReturnType<typeof calculateQuestionCharts> | null>(null)
  const captureLabel = useMemo(() => chart
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: chart.event.timezone }).format(new Date(chart.event.capturedAt))
    : '', [chart])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const questionEvent = createQuestionEvent({
        question,
        capturedAt: new Date(capturedAt).toISOString(),
        timezone,
        locationLabel: location,
      })
      setChart(calculateQuestionCharts(questionEvent))
    } catch (reason) {
      setChart(null)
      setError(reason instanceof Error ? reason.message : 'The question event could not be captured.')
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6 animate-fade-in" aria-labelledby="question-charts-title">
      <header className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold">One event · three independent charts</p>
        <h2 id="question-charts-title" className="text-3xl font-semibold" style={{ fontFamily: 'var(--font-serif)' }}>Question Charts</h2>
        <p className="mx-auto max-w-2xl text-sm text-text-muted">
          Capture one question, time, timezone, and location record. Liu Yao, Qi Men Dun Jia, and Da Liu Ren calculate separately from that same immutable event.
        </p>
        <p className="text-xs text-text-muted">For entertainment &amp; self-discovery only. Not professional advice.</p>
      </header>

      <form onSubmit={submit} className="glass glass-gold grid gap-4 p-5 md:grid-cols-2" noValidate>
        <div className="md:col-span-2">
          <label htmlFor="question-event-question" className="mb-1.5 block text-sm font-medium text-text-secondary">Question</label>
          <textarea id="question-event-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={3} required className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-text focus:border-star/50 focus:outline-none" placeholder="Ask one concrete question." />
        </div>
        <Input id="question-event-time" label="Capture time" type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} required />
        <Input id="question-event-timezone" label="IANA timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} required hint="For example: Asia/Shanghai or America/Los_Angeles" />
        <Input id="question-event-location" label="Location evidence" value={location} onChange={(event) => setLocation(event.target.value)} required placeholder="City or an anonymous evidence label" hint="Stored only in this in-memory event." />
        <div className="flex items-end">
          <Button type="submit" variant="gold" className="w-full">Cast three charts</Button>
        </div>
        {error && <p role="alert" className="md:col-span-2 text-sm text-misfortune">{error}</p>}
      </form>

      {chart && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm">
            <p><span className="text-text-muted">Captured once:</span> {captureLabel} · {chart.event.timezone} · {chart.event.location.label}</p>
            <p className="mt-1 text-xs text-text-muted">Event contract {chart.event.version}. Verified structural facts only—no merged conclusion, AI narrative, or score.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {chart.results.map((result) => <FactCard key={result.method} result={result} />)}
          </div>
        </div>
      )}
    </section>
  )
}

function FactCard({ result }: { result: FactResult }) {
  const titles = { liuyao: 'Liu Yao', qimen: 'Qi Men Dun Jia', liuren: 'Da Liu Ren' }
  return (
    <article className="glass min-w-0 p-5" aria-labelledby={`${result.method}-title`}>
      <h3 id={`${result.method}-title`} className="text-xl text-gold" style={{ fontFamily: 'var(--font-serif)' }}>{titles[result.method]}</h3>
      <p className="mt-1 break-words text-xs text-text-muted">{result.metadata.contractVersion} · {result.metadata.provider} {result.metadata.providerVersion}</p>
      {result.metadata.status === 'failed' || !result.facts ? (
        <p role="alert" className="mt-4 text-sm text-misfortune">{result.metadata.failure?.message ?? 'Calculation failed closed.'}</p>
      ) : (
        <dl className="mt-4 space-y-2 text-sm">
          {Object.entries(result.facts).filter(([key]) => key !== 'contract').map(([key, value]) => (
            <div key={key} className="flex items-start justify-between gap-4 border-b border-white/[0.05] pb-2">
              <dt className="capitalize text-text-muted">{key.replace(/([A-Z])/g, ' $1')}</dt>
              <dd className="max-w-[60%] break-words text-right">{Array.isArray(value) ? value.join(' · ') : String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  )
}
