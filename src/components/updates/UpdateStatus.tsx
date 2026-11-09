/**
 * ACA Connect — App Update Status UI
 * ==================================
 *
 * Displays the current update status and provides actions to check for,
 * download, and install updates. Works on Windows desktop (Electron) and
 * Android (Capacitor). On web, it reports availability only.
 *
 * Consumes the shared update service (`src/services/update.ts`) and renders
 * a card consistent with the existing Settings page design.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { Download, RefreshCw, AlertCircle, CheckCircle2, Loader2, Smartphone, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import type { UpdateState } from '@/services/update'
import {
  subscribe,
  getUpdateState,
  checkForUpdates,
  downloadDesktopUpdate,
  installDesktopUpdate,
  runAndroidUpdateFlow,
  downloadAndroidApk,
} from '@/services/update'
import { useNetwork } from '@/context/network-context'

interface UpdateStatusProps {
  /** When true, renders a compact variant suitable for the Header. */
  compact?: boolean
}

export function UpdateStatus({ compact = false }: UpdateStatusProps = {}) {
  const { online } = useNetwork()
  const [localState, setLocalState] = useState<UpdateState>(getUpdateState())
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'install' | 'download' | null>(null)
  const [platform] = useState<'desktop' | 'android' | 'web' | 'unknown'>(
    Capacitor.isNativePlatform()
      ? 'android'
      : typeof window.process?.versions?.electron === 'string'
        ? 'desktop'
        : 'web'
  )

  useEffect(() => {
    const unsub = subscribe((s) => setLocalState(s))
    // Run an initial check once mounted (only when online).
    if (online) {
      void checkForUpdates()
    }
    return unsub
  }, [online])

  const release = localState.releaseInfo
  const isDesktop = platform === 'desktop'
  const isAndroid = platform === 'android'

  const handleCheck = useCallback(async () => {
    await checkForUpdates()
  }, [])

  const handleDownload = useCallback(async () => {
    if (isDesktop) {
      setConfirmAction(null)
      setShowConfirm(false)
      const result = await downloadDesktopUpdate()
      if (!result.success) {
        // Error already reflected in service state
      }
    } else if (isAndroid && release) {
      setConfirmAction(null)
      setShowConfirm(false)
      const result = await downloadAndroidApk(release, (_p) => {
        // progress reflected in service state
      })
      if (!result.success) {
        // Error already reflected
      } else {
        setConfirmAction('install')
        setShowConfirm(true)
      }
    }
  }, [isDesktop, isAndroid, release])

  const handleInstall = useCallback(async () => {
    if (isDesktop) {
      await installDesktopUpdate()
    } else if (isAndroid && release) {
      // After download, the APK path is in state; re-run the flow to install
      const result = await runAndroidUpdateFlow()
      if (result.error) {
        // Error reflected in state
      }
      setShowConfirm(false)
    }
  }, [isDesktop, isAndroid, release])

  const statusLabel = (): string => {
    switch (localState.status) {
      case 'idle': return 'Not checked'
      case 'checking': return 'Checking for updates…'
      case 'available': return 'Update available'
      case 'downloading': return 'Downloading update…'
      case 'downloaded': return 'Update downloaded'
      case 'ready-to-install': return 'Ready to install'
      case 'failed': return 'Update failed'
      case 'offline': return 'No internet connection'
      case 'up-to-date': return 'Up to date'
      default: return 'Unknown'
    }
  }

  const statusTone = (): 'neutral' | 'success' | 'warning' | 'danger' | 'navy' | 'gold' => {
    switch (localState.status) {
      case 'up-to-date': return 'success'
      case 'available': return 'gold'
      case 'downloading':
      case 'downloaded':
      case 'ready-to-install': return 'navy'
      case 'failed': return 'danger'
      case 'offline': return 'warning'
      default: return 'neutral'
    }
  }

  const iconForStatus = (): ReactNode => {
    switch (localState.status) {
      case 'up-to-date': return <CheckCircle2 className="size-5 shrink-0" />
      case 'available': return <Smartphone className="size-5 shrink-0" />
      case 'downloading':
      case 'downloaded': return <Loader2 className="size-5 shrink-0 animate-spin" />
      case 'failed': return <AlertCircle className="size-5 shrink-0" />
      case 'offline': return <AlertCircle className="size-5 shrink-0" />
      default: return <Monitor className="size-5 shrink-0" />
    }
  }

  const canDownload = localState.status === 'available' || localState.status === 'downloaded' || localState.status === 'failed'
  const canInstall = localState.status === 'downloaded' || localState.status === 'ready-to-install'
  const canCheck = !localState.checking && online

  const progressBar = (): ReactNode | null => {
    if (localState.status !== 'downloading' && localState.status !== 'downloaded') return null
    const pct = localState.progress ?? 0
    return (
      <div className="w-full bg-cream-200 rounded-full h-2.5 mb-3">
        <div
          className="bg-navy-900 h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    )
  }

  if (compact) {
    // Compact variant: just a badge + button
    if (localState.status === 'up-to-date' || localState.status === 'idle') return null
    return (
      <div className="flex items-center gap-2">
        <Badge tone={statusTone() as any} className="text-xs">
          {statusLabel()}
        </Badge>
        {canCheck && (
          <Button size="sm" variant="ghost" onClick={handleCheck} className="text-xs px-2">
            <RefreshCw className="size-3" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
              {iconForStatus()}
            </span>
            <div>
              <CardTitle>App Updates</CardTitle>
              <p className="text-sm text-navy-500">
                Keep ACA Connect up to date on {isAndroid ? 'Android' : isDesktop ? 'Windows' : 'this device'}.
              </p>
            </div>
          </div>
          <Badge tone={statusTone() as any}>
            {statusLabel()}
          </Badge>
        </div>
      </CardHeader>

      <div className="divide-y divide-cream-200">
        <CardContent className="p-5 pt-0">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-navy-600">Current version</span>
              <span className="text-navy-800 font-medium">{localState.currentVersion}</span>
            </div>
            {release && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-navy-600">Latest version</span>
                <span className="text-navy-800 font-medium">{release.version}</span>
              </div>
            )}
            {localState.lastChecked && (
              <div className="flex items-center justify-between text-xs text-navy-400">
                <span>Last checked</span>
                <span>{new Date(localState.lastChecked).toLocaleTimeString()}</span>
              </div>
            )}
          </div>

          {localState.status === 'available' && release && release.releaseNotes && (
            <details className="border border-cream-200 rounded-lg p-3 bg-cream-50">
              <summary className="font-medium text-navy-700 cursor-pointer">
                Release notes
              </summary>
              <div className="mt-2 text-sm text-navy-600 whitespace-pre-wrap break-words">
                {release.releaseNotes}
              </div>
            </details>
          )}

          {localState.error && (
            <div className="rounded-lg bg-red-50 p-3 border border-red-100">
              <div className="flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 text-red-600 mt-0.5" />
                <p className="text-sm text-red-800">{localState.error}</p>
              </div>
              <button
                type="button"
                onClick={handleCheck}
                className="mt-2 text-xs underline text-navy-600 hover:text-navy-800"
              >
                Retry
              </button>
            </div>
          )}

          {progressBar()}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
            {canCheck && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCheck}
                loading={localState.checking}
                disabled={!online}
              >
                <RefreshCw className="size-3.5 shrink-0" />
                {localState.checking ? 'Checking…' : 'Check for updates'}
              </Button>
            )}
            {canDownload && release && (
              <Button
                size="sm"
                onClick={handleDownload}
                loading={localState.status === 'downloading'}
                disabled={!online}
              >
                <Download className="size-3.5 shrink-0" />
                {localState.status === 'downloading' ? 'Downloading…' : 'Download update'}
              </Button>
            )}
            {canInstall && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  if (isDesktop) {
                    setShowConfirm(true)
                    setConfirmAction('install')
                  } else {
                    handleInstall()
                  }
                }}
              >
                {isDesktop ? 'Restart & install' : 'Install update'}
              </Button>
            )}
          </div>
        </CardContent>
      </div>
    </Card>

    {/* Desktop install confirmation */}
    <ConfirmDialog
      open={showConfirm && confirmAction === 'install' && !isAndroid}
      title="Install update & restart?"
      description="The new version has been downloaded. ACA Connect will close and reopen to complete the update. Your data and settings will be preserved."
      confirmLabel="Restart & install"
      cancelLabel="Cancel"
      tone="primary"
      loading={localState.status === 'ready-to-install'}
      onConfirm={handleInstall}
      onClose={() => setShowConfirm(false)}
    />

    {/* Android install prompt */}
    <Modal
      open={showConfirm && confirmAction === 'install' && isAndroid}
      title="Install APK update"
      description="The update has been downloaded. Android will open the system Package Installer to install the new APK. You may need to enable 'Install unknown apps' for ACA Connect in Android Settings the first time. Your existing data, login, and settings will be preserved."
      onClose={() => setShowConfirm(false)}
      footer={
        <>
          <Button variant="secondary" onClick={() => setShowConfirm(false)}>
            Later
          </Button>
          <Button variant="primary" onClick={handleInstall}>
            Install now
          </Button>
        </>
      }
    >
      The update has been downloaded. Android will open the system Package Installer to install the new APK. You may need to enable 'Install unknown apps' for ACA Connect in Android Settings the first time. Your existing data, login, and settings will be preserved.
    </Modal>
  </>
  )
}