import { createContext, useContext } from 'react'
import type {
  MemberFieldKey,
  MemberFieldOverrides,
  MemberFieldSettings,
} from '@/config/member-fields'

export interface MemberFieldsContextValue {
  settings: MemberFieldSettings
  overrides: MemberFieldOverrides
  setFieldVisible: (key: MemberFieldKey, visible: boolean) => void
  setFieldRequired: (key: MemberFieldKey, required: boolean) => void
  reset: () => void
}

export const MemberFieldsContext =
  createContext<MemberFieldsContextValue | null>(null)

export function useMemberFields() {
  const ctx = useContext(MemberFieldsContext)
  if (!ctx) {
    throw new Error('useMemberFields must be used within a MemberFieldsProvider')
  }
  return ctx
}
