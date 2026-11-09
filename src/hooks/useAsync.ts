import { useEffect, useState } from 'react'
import type { AsyncState } from '@/types'

/**
 * Minimal async data hook used by the demo screens.
 *
 * `deps` re-runs the loader (like `useEffect`). The loader must be stable or
 * memoised by the caller when `deps` change frequently.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    loader()
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            error: error instanceof Error ? error.message : 'Something went wrong',
          })
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { ...state, reload: () => setNonce((n) => n + 1) }
}
