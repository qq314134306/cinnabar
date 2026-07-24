import {
  Component,
  Suspense,
  type ErrorInfo,
  type ReactNode,
} from 'react'

interface LazySurfaceProps {
  children?: ReactNode
  label: string
  loadingLabel: string
  onReload?: () => void
}

interface LazySurfaceBoundaryProps {
  children?: ReactNode
  label: string
  onReload?: () => void
}

interface LazySurfaceBoundaryState {
  failed: boolean
}

function reloadPage() {
  window.location.reload()
}

class LazySurfaceBoundary extends Component<
  LazySurfaceBoundaryProps,
  LazySurfaceBoundaryState
> {
  state: LazySurfaceBoundaryState = { failed: false }

  static getDerivedStateFromError(): LazySurfaceBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('A lazy product surface failed to load.', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children

    const { label, onReload = reloadPage } = this.props

    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div
          role="alert"
          className="max-w-md rounded-2xl border border-cinnabar/25 bg-cinnabar/[0.08] p-6 text-center"
        >
          <h2 className="text-lg font-semibold text-text">
            We couldn&apos;t load {label}.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            A network interruption or site update may have interrupted this
            part of Cinnabar. Reload the page to request a fresh copy.
          </p>
          <button
            type="button"
            onClick={onReload}
            className="mt-5 rounded-lg bg-cinnabar/20 px-4 py-2 text-sm font-medium text-cinnabar-light transition-colors hover:bg-cinnabar/30"
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}

export function LazySurface({
  children,
  label,
  loadingLabel,
  onReload,
}: LazySurfaceProps) {
  return (
    <LazySurfaceBoundary label={label} onReload={onReload}>
      <Suspense fallback={<SurfaceLoading label={loadingLabel} />}>
        {children}
      </Suspense>
    </LazySurfaceBoundary>
  )
}

function SurfaceLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-3 text-sm text-text-muted"
      >
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-star border-t-transparent"
        />
        {label}
      </div>
    </div>
  )
}
