import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  resolveMemberFieldSettings,
  type MemberFieldKey,
  type MemberFieldOverrides,
} from '@/config/member-fields'
import { MemberFieldsContext } from './member-fields-context'

/**
 * Member field preferences are an administrator concern, not church data, so
 * they are stored in `localStorage` (device preference) rather than the
 * backend. They are safe to lose and never contain member information.
 */
const STORAGE_KEY = 'aca-connect.member-fields'

function readOverrides(): MemberFieldOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as MemberFieldOverrides) : {}
  } catch {
    return {}
  }
}

function persist(overrides: MemberFieldOverrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // Storage can be unavailable (private mode); preferences stay in memory.
  }
}

export function MemberFieldsProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<MemberFieldOverrides>(() =>
    readOverrides(),
  )

  const update = useCallback(
    (
      key: MemberFieldKey,
      patch: { visible?: boolean; required?: boolean },
    ) => {
      setOverrides((prev) => {
        const next = { ...prev, [key]: { ...prev[key], ...patch } }
        persist(next)
        return next
      })
    },
    [],
  )

  const setFieldVisible = useCallback(
    (key: MemberFieldKey, visible: boolean) => update(key, { visible }),
    [update],
  )

  const setFieldRequired = useCallback(
    (key: MemberFieldKey, required: boolean) => update(key, { required }),
    [update],
  )

  const reset = useCallback(() => {
    setOverrides({})
    persist({})
  }, [])

  const settings = useMemo(
    () => resolveMemberFieldSettings(overrides),
    [overrides],
  )

  const value = useMemo(
    () => ({
      settings,
      overrides,
      setFieldVisible,
      setFieldRequired,
      reset,
    }),
    [settings, overrides, setFieldVisible, setFieldRequired, reset],
  )

  return (
    <MemberFieldsContext.Provider value={value}>
      {children}
    </MemberFieldsContext.Provider>
  )
}
