import { useState, type FormEvent } from 'react'
import { Building2, Database, Bell, LogOut, SlidersHorizontal, RotateCcw, Lock, Monitor } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/FormField'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/context/toast-context'
import { useAuth } from '@/context/auth-context'
import { useMemberFields } from '@/context/member-fields-context'
import { cn } from '@/lib/utils'
import {
  MEMBER_FIELD_DEFS,
  MEMBER_FIELD_GROUPS,
  type MemberFieldDefinition,
} from '@/config/member-fields'
import { DEMO_NOTICE } from '@/lib/demo-data'
import { isDemoMode } from '@/lib/supabase'
import { UpdateStatus } from '@/components/updates/UpdateStatus'

export default function SettingsPage() {
  const { openMenu } = useAppShell()
  const { toast } = useToast()
  const { signOut } = useAuth()
  const { settings, setFieldVisible, setFieldRequired, reset } = useMemberFields()
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState({
    newMember: true,
    birthdays: true,
    followUp: false,
    weekly: true,
  })

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 600))
    setSaving(false)
    toast({
      title: 'Demo only — settings not saved',
      description: 'Preferences will persist once a backend is connected.',
      variant: 'info',
    })
  }

  return (
    <>
      <Header
        title="Settings"
        subtitle="Church profile, notifications and platform preferences."
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                <Building2 className="size-5" />
              </span>
              <div>
                <CardTitle>Church profile</CardTitle>
                <p className="text-sm text-navy-500">
                  Displayed across ACA Connect.
                </p>
              </div>
            </div>
          </CardHeader>
          <form onSubmit={handleSave} className="space-y-4 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Church name" defaultValue="ACA Pozhichalur Ministries" />
              <Input label="Branch / location" defaultValue="Pozhichalur, Chennai" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Contact email"
                type="email"
                defaultValue="office@acapozhichalur.org"
              />
              <Input
                label="Contact phone"
                type="tel"
                defaultValue="+91 98400 00000"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                Save profile
              </Button>
            </div>
          </form>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                  <Bell className="size-5" />
                </span>
                <div>
                  <CardTitle>Notifications</CardTitle>
                  <p className="text-sm text-navy-500">
                    Choose what the team hears about.
                  </p>
                </div>
              </div>
            </CardHeader>
            <div className="divide-y divide-cream-200 px-6 py-2">
              <Switch
                label="New member added"
                description="Notify when someone joins the directory."
                checked={prefs.newMember}
                onChange={(v) => setPrefs({ ...prefs, newMember: v })}
              />
              <Switch
                label="Birthday reminders"
                description="Daily digest of upcoming birthdays."
                checked={prefs.birthdays}
                onChange={(v) => setPrefs({ ...prefs, birthdays: v })}
              />
              <Switch
                label="Follow-up alerts"
                description="Flag members who have been inactive."
                checked={prefs.followUp}
                onChange={(v) => setPrefs({ ...prefs, followUp: v })}
              />
              <Switch
                label="Weekly summary"
                description="A weekly overview every Monday morning."
                checked={prefs.weekly}
                onChange={(v) => setPrefs({ ...prefs, weekly: v })}
              />
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                    <Database className="size-5" />
                  </span>
                  <div>
                    <CardTitle>Data & environment</CardTitle>
                    <p className="text-sm text-navy-500">
                      Backend connection status.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <div className="space-y-4 p-6">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-navy-600">Data source</span>
                  <Badge tone={isDemoMode ? 'gold' : 'success'}>
                    {isDemoMode ? 'Demo data' : 'Supabase connected'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-navy-600">Persistence</span>
                  <Badge tone="neutral">Not configured</Badge>
                </div>
                <p className="rounded-xl bg-cream-100 p-3 text-xs text-navy-500">
                  {DEMO_NOTICE}. Add Supabase credentials in{' '}
                  <code className="font-mono">.env.local</code> to go live.
                </p>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Session</CardTitle>
              </CardHeader>
              <div className="p-6">
                <Button
                  variant="secondary"
                  icon={<LogOut className="size-4" />}
                  onClick={signOut}
                >
                  Sign out
                </Button>
              </div>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                <Monitor className="size-5" />
              </span>
              <div>
                <CardTitle>App updates</CardTitle>
                <p className="text-sm text-navy-500">
                  Automatic updates for Windows desktop and Android.
                </p>
              </div>
            </div>
          </CardHeader>
          <div className="p-6">
            <UpdateStatus />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                  <SlidersHorizontal className="size-5" />
                </span>
                <div>
                  <CardTitle>Member fields</CardTitle>
                  <p className="text-sm text-navy-500">
                    Choose which fields appear on member forms and profiles.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw className="size-4" />}
                onClick={() => {
                  reset()
                  toast({
                    title: 'Member fields reset',
                    description: 'All fields are back to their defaults.',
                    variant: 'info',
                  })
                }}
              >
                Reset to defaults
              </Button>
            </div>
          </CardHeader>
          <div className="space-y-5 p-6">
            <p className="rounded-xl bg-cream-100 p-3 text-xs text-navy-500">
              Preferences are stored on this device only and never affect church
              records. Fields marked <strong>Required</strong> are locked on
              member forms.
            </p>

            {MEMBER_FIELD_GROUPS.map((group) => {
              const fields = MEMBER_FIELD_DEFS.filter(
                (def) => def.group === group.id,
              )
              if (fields.length === 0) return null
              return (
                <div key={group.id}>
                  <p className="mb-1 text-xs font-semibold tracking-wider text-navy-400 uppercase">
                    {group.label}
                  </p>
                  <div className="divide-y divide-cream-200">
                    {fields.map((def) => (
                      <FieldRow
                        key={def.key}
                        definition={def}
                        visible={settings[def.key]?.visible ?? true}
                        required={settings[def.key]?.required ?? false}
                        onVisible={(value) => setFieldVisible(def.key, value)}
                        onRequired={(value) => setFieldRequired(def.key, value)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </Page>
    </>
  )
}

function FieldRow({
  definition,
  visible,
  required,
  onVisible,
  onRequired,
}: {
  definition: MemberFieldDefinition
  visible: boolean
  required: boolean
  onVisible: (value: boolean) => void
  onRequired: (value: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-medium text-navy-800">
          {definition.label}
        </span>
        {definition.sensitive && <Badge tone="warning">Sensitive</Badge>}
        {!definition.configurable && (
          <Badge tone="neutral">
            <Lock className="size-3" aria-hidden="true" />
            Always shown
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-4">
        {definition.configurable ? (
          <MiniToggle
            label="Show"
            checked={visible}
            disabled={definition.lockedRequired}
            onChange={onVisible}
          />
        ) : null}
        {definition.lockedRequired ? (
          <span className="text-xs font-medium text-navy-400">Required</span>
        ) : definition.requiredConfigurable ? (
          <MiniToggle
            label="Required"
            checked={required}
            disabled={!visible}
            onChange={onRequired}
          />
        ) : null}
      </div>
    </div>
  )
}

function MiniToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex items-center gap-2 text-xs font-medium transition',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        checked ? 'text-navy-900' : 'text-navy-400',
      )}
    >
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition',
          checked ? 'bg-navy-900' : 'bg-navy-200',
        )}
      >
        <span
          className={cn(
            'inline-block size-3.5 rounded-full bg-white shadow transition',
            checked ? 'translate-x-4.5' : 'translate-x-1',
          )}
        />
      </span>
      {label}
    </button>
  )
}
