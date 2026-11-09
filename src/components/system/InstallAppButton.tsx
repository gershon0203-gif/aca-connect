import { useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { isNativePlatform } from '@/lib/platform'

interface InstallAppButtonProps {
  className?: string
  /** Force the text label (useful on the sign-in screen). */
  showLabel?: boolean
}

/**
 * "Install app" affordance.
 *
 * - When the browser exposes the install prompt (Chromium), the button replays
 *   it so the user gets the native one-tap install.
 * - When it does not (iOS Safari, Firefox, Safari desktop), it opens clear
 *   manual instructions instead.
 * - Hidden once the app is installed, and inside the native Capacitor shell.
 */
export function InstallAppButton({
  className,
  showLabel = false,
}: InstallAppButtonProps) {
  const { canPrompt, isInstalled, isIos, promptInstall } = usePwaInstall()
  const [showHelp, setShowHelp] = useState(false)
  const [busy, setBusy] = useState(false)

  if (isNativePlatform || isInstalled) return null

  const handleClick = async () => {
    if (!canPrompt) {
      setShowHelp(true)
      return
    }
    setBusy(true)
    try {
      await promptInstall()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<Download className="size-4" />}
        onClick={handleClick}
        loading={busy}
        className={className}
        aria-label="Install ACA Connect"
        title="Install ACA Connect"
      >
        <span className={showLabel ? undefined : 'hidden sm:inline'}>
          Install app
        </span>
        {!showLabel && <span className="sm:hidden">Install</span>}
      </Button>

      <InstallInstructions
        open={showHelp}
        onClose={() => setShowHelp(false)}
        isIos={isIos}
      />
    </>
  )
}

function Step({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 size-1.5 shrink-0 translate-y-2 rounded-full bg-gold-500" />
      <span>{children}</span>
    </li>
  )
}

function InstallInstructions({
  open,
  onClose,
  isIos,
}: {
  open: boolean
  onClose: () => void
  isIos: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Install ACA Connect"
      description="Add the app to your device for quick, full-screen access."
      footer={<Button onClick={onClose}>Got it</Button>}
    >
      <div className="flex flex-col gap-6 text-sm text-navy-700">
        <section className={isIos ? 'order-first' : undefined}>
          <h3 className="font-display text-base font-semibold text-navy-900">
            iPhone / iPad (Safari)
          </h3>
          <ol className="mt-2 space-y-1.5">
            <Step>
              Tap the <strong>Share</strong> button in the toolbar.
            </Step>
            <Step>
              Choose <strong>Add to Home Screen</strong>.
            </Step>
            <Step>
              Tap <strong>Add</strong> — the ACA Connect icon appears on your
              home screen.
            </Step>
          </ol>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-navy-900">
            Windows / macOS (Chrome or Edge)
          </h3>
          <ol className="mt-2 space-y-1.5">
            <Step>
              Click the <strong>install</strong> icon in the address bar
              (a small monitor with a plus / arrow).
            </Step>
            <Step>
              Or open the browser menu (<strong>⋮</strong>) →{' '}
              <strong>Install ACA Connect</strong> (Edge:{' '}
              <strong>Apps → Install this site as an app</strong>).
            </Step>
            <Step>
              Confirm — it launches from the Start menu / Applications like a
              desktop app.
            </Step>
          </ol>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-navy-900">
            Android (Chrome)
          </h3>
          <ol className="mt-2 space-y-1.5">
            <Step>
              Tap the menu (<strong>⋮</strong>) in the top-right.
            </Step>
            <Step>
              Tap <strong>Install app</strong> (or{' '}
              <strong>Add to Home screen</strong>).
            </Step>
            <Step>
              Confirm — the app opens standalone from your home screen.
            </Step>
          </ol>
        </section>

        <p className="rounded-xl bg-cream-100 p-3 text-xs text-navy-500">
          Installation is only offered on a secure (<strong>HTTPS</strong>)
          connection. You do not need to install the app to use it — it works
          fine in the browser.
        </p>
      </div>
    </Modal>
  )
}
