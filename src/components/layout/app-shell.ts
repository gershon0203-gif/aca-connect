import { useOutletContext } from 'react-router-dom'

export interface AppShellContext {
  openMenu: () => void
}

/**
 * Access shell controls (like opening the mobile navigation drawer) from any
 * page rendered inside `AppLayout`.
 */
export function useAppShell() {
  return useOutletContext<AppShellContext>()
}
