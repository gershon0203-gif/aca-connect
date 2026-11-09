import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Church, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Top-level error boundary.
 *
 * Without this, an uncaught render error unmounts the whole React tree and the
 * user is left staring at a blank white screen. Instead we show a calm recovery
 * screen with a reload action. It never hides data — records live on the server.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="safe-top safe-bottom flex min-h-dvh flex-col items-center justify-center bg-cream-100 px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-navy-900 text-gold-400">
          <Church className="size-7" />
        </span>
        <h1 className="font-display mt-5 text-2xl font-semibold text-navy-900">
          Something went wrong
        </h1>
        <p className="mt-2 max-w-md text-sm text-navy-500">
          ACA Connect ran into an unexpected problem. Your data is safe on the
          server — try reloading the screen.
        </p>
        <Button
          className="mt-6"
          icon={<RotateCcw className="size-4" />}
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </div>
    )
  }
}
