/**
 * Push notification device registration and interaction
 * =====================================================
 *
 * Registers the device's FCM token with Supabase so the send-push-notification
 * Edge Function can deliver Android push notifications (attendance, prayer and
 * chat) to this member's devices.
 *
 * Important Capacitor detail: `PushNotifications.getToken()` does not exist in
 * Capacitor v8. The supported flow is `register()` + the `registration` event.
 * The previous implementation called the non-existent method, so token
 * registration failed silently and no device ever received a push.
 *
 * Only the member's own tokens are ever registered — RLS enforces this at the
 * database level. The Firebase service-account private key never reaches the
 * frontend; it lives only in Edge Function secrets.
 */

import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type Token,
} from '@capacitor/push-notifications'
import { getSupabaseClient, isDemoMode, RPC } from '@/lib/supabase'
import { delay } from './latency'

export type PushPlatform = 'android' | 'ios' | 'web'

const TOKEN_STORAGE_KEY = 'aca-connect.push-token'
const PENDING_DESTINATION_KEY = 'aca-connect.push-destination'

/** The FCM token last registered by this device (persisted across launches). */
let currentToken: string | null = readStoredToken()
let listenerHandles: PluginListenerHandle[] = []
let listenersReady: Promise<void> | null = null

type TokenWaiter = {
  resolve: (token: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let tokenWaiters: TokenWaiter[] = []
let pendingDestination: string | null = readStoredDestination()

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* -------------------------------------------------------------------------- */
/* Storage helpers                                                             */
/* -------------------------------------------------------------------------- */

function readStoredToken(): string | null {
  try {
    const value = localStorage.getItem(TOKEN_STORAGE_KEY)
    return value && value.trim().length > 0 ? value : null
  } catch {
    return null
  }
}

function storeToken(token: string): void {
  currentToken = token
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    /* storage unavailable — the in-memory value still works this session */
  }
}

function clearStoredToken(): void {
  currentToken = null
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function readStoredDestination(): string | null {
  try {
    return sessionStorage.getItem(PENDING_DESTINATION_KEY)
  } catch {
    return null
  }
}

function storePendingDestination(destination: string): void {
  pendingDestination = destination
  try {
    sessionStorage.setItem(PENDING_DESTINATION_KEY, destination)
  } catch {
    /* ignore */
  }
}

/**
 * Read (and clear) a destination captured before the router mounted. Used when
 * a notification is tapped while the app is cold-starting.
 */
export function consumePendingPushDestination(): string | null {
  const destination =
    pendingDestination ??
    (() => {
      try {
        return sessionStorage.getItem(PENDING_DESTINATION_KEY)
      } catch {
        return null
      }
    })()

  pendingDestination = null
  try {
    sessionStorage.removeItem(PENDING_DESTINATION_KEY)
  } catch {
    /* ignore */
  }
  return sanitizePushDestination(destination)
}

/* -------------------------------------------------------------------------- */
/* Destination validation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Only allow internal app routes. A push payload is server-controlled, but the
 * client still refuses absolute URLs, schemes and control characters so a
 * malformed payload can never become an open redirect.
 */
export function sanitizePushDestination(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const destination = value.trim()
  if (destination.length === 0 || destination.length > 300) return null
  if (!destination.startsWith('/') || destination.startsWith('//')) return null
  if (destination.includes('://')) return null
  // Reject backslashes and control characters (CR/LF header-injection style).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(destination)) return null
  return destination
}

function chatDestination(data: Record<string, unknown>): string {
  const withUserId = typeof data.with === 'string' ? data.with : null
  if (data.channel === 'private' && withUserId && UUID_RE.test(withUserId)) {
    return `/chat?tab=private&with=${withUserId}`
  }
  return '/chat'
}

/** Resolve the screen to open for a notification's data payload. */
export function resolvePushDestination(data: unknown): string {
  const record =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {}

  const explicit = sanitizePushDestination(record.destination)
  if (explicit) return explicit

  switch (record.type) {
    case 'attendance_reminder':
      return '/my-attendance'
    case 'prayer_reminder':
      return '/prayers'
    case 'chat_message':
      return chatDestination(record)
    default:
      return '/notifications'
  }
}

/* -------------------------------------------------------------------------- */
/* Native listeners                                                            */
/* -------------------------------------------------------------------------- */

function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

function dispatchEvent(name: string, detail: unknown): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

/**
 * Install the native push listeners exactly once. Both `registerDeviceToken()`
 * and `registerPushListeners()` call this, so there is no ordering race between
 * the auth provider and the app shell.
 */
async function installPushListeners(): Promise<void> {
  if (!isNativePlatform()) return
  if (listenersReady) return listenersReady

  listenersReady = (async () => {
    const handles = await Promise.all([
      PushNotifications.addListener('registration', (token: Token) => {
        handleNewToken(token.value)
      }),
      PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration failed:', error.error)
        rejectTokenWaiters(new Error(error.error || 'Push registration failed'))
      }),
      PushNotifications.addListener(
        'pushNotificationReceived',
        (notification: PushNotificationSchema) => {
          // The Capacitor plugin already displays a system notification in the
          // foreground when `presentationOptions` includes `alert` (see
          // capacitor.config.ts). We only forward the data to the UI; creating a
          // second local notification here would duplicate it.
          const data =
            notification.data && typeof notification.data === 'object'
              ? (notification.data as Record<string, unknown>)
              : {}
          dispatchEvent('aca-push-received', {
            id: notification.id,
            title: notification.title,
            body: notification.body,
            type: data.type,
            referenceId: data.reference_id,
            destination: resolvePushDestination(data),
          })
        },
      ),
      PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action: ActionPerformed) => {
          const data =
            action.notification?.data &&
            typeof action.notification.data === 'object'
              ? (action.notification.data as Record<string, unknown>)
              : {}
          const destination = resolvePushDestination(data)
          // Store first: on a cold start the router may mount a tick later.
          storePendingDestination(destination)
          dispatchEvent('aca-push-tapped', { destination, data })
        },
      ),
    ])

    listenerHandles = handles
  })()

  return listenersReady
}

/**
 * Register the current device's FCM token with Supabase.
 * Safe to call on every app launch; the RPC upserts on
 * (member_id, token, platform).
 *
 * Returns true only when the token was actually registered server-side. It
 * returns false when running on the web, in demo mode, when notification
 * permission was denied, or when Firebase/Supabase rejected the token — the UI
 * must not pretend a push was registered.
 */
export async function registerDeviceToken(): Promise<boolean> {
  if (!isNativePlatform()) return false
  if (isDemoMode) {
    await delay(150)
    return false
  }

  await installPushListeners()

  try {
    // Android 13+ requires the runtime POST_NOTIFICATIONS permission. On older
    // versions checkPermissions()/requestPermissions() resolve as granted.
    const current = await PushNotifications.checkPermissions()
    let receive = current.receive
    if (receive !== 'granted') {
      const requested = await PushNotifications.requestPermissions()
      receive = requested.receive
    }
    if (receive !== 'granted') {
      // User declined (or Android policy blocked it). Do not register a token
      // that could never display a notification.
      return false
    }

    // Always request the current FCM token from Firebase. Capacitor v8 has no
    // getToken(), so register() + the `registration` event is the only way to
    // obtain it. Calling it on every launch ensures token rotations are picked
    // up: a stale token is the #1 reason push notifications stop arriving.
    const token = await requestFreshToken()
    const previous = readStoredToken()
    if (previous && previous !== token) {
      // Retire the old token for this member only (the RPC scopes by auth.uid()).
      await unregisterDeviceToken(previous).catch(() => undefined)
    }
    return await persistToken(token, previous)
  } catch (error) {
    console.error('Push registration failed:', error)
    return false
  }
}

/**
 * Unregister (deactivate) a device token. Called on sign-out. When no token is
 * supplied the last token registered by this device is used.
 */
export async function unregisterDeviceToken(token?: string): Promise<void> {
  const target = token ?? currentToken ?? readStoredToken()
  if (!target) return

  if (isDemoMode) {
    await delay(100)
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) return

  try {
    await supabase.rpc(RPC.memberUnregisterDeviceToken, { p_token: target })
  } finally {
    // Only clear storage when unregistering the device's current token. During
    // a token refresh the old token is retired after the new one is stored.
    if (!token || token === (currentToken ?? readStoredToken())) {
      clearStoredToken()
    }
  }
}

/**
 * Listen for incoming push notifications while the app is in the foreground and
 * for taps on delivered notifications. Dispatches custom events consumed by
 * `PushNavigationHandler` and the notification inbox.
 *
 * Returns a cleanup function.
 */
export async function registerPushListeners(): Promise<() => void> {
  if (!isNativePlatform()) return () => undefined
  await installPushListeners()

  return () => {
    for (const handle of listenerHandles) {
      void handle.remove()
    }
    listenerHandles = []
    listenersReady = null
    rejectTokenWaiters(new Error('Push listeners removed'))
  }
}

/* -------------------------------------------------------------------------- */
/* Token lifecycle                                                             */
/* -------------------------------------------------------------------------- */

function handleNewToken(token: string): void {
  if (typeof token !== 'string' || token.trim().length === 0) return
  const previous = currentToken ?? readStoredToken()
  storeToken(token)

  if (tokenWaiters.length > 0) {
    // A registration call is waiting for this token; it will persist it.
    resolveTokenWaiters(token)
    return
  }

  // Firebase rotated the token while the app was running.
  void persistToken(token, previous)
}

function requestFreshToken(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const waiter: TokenWaiter = {
      resolve,
      reject,
      timer: setTimeout(() => {
        tokenWaiters = tokenWaiters.filter((item) => item !== waiter)
        reject(new Error('Push registration timed out'))
      }, 15_000),
    }
    tokenWaiters.push(waiter)

    PushNotifications.register().catch((error: unknown) => {
      clearTimeout(waiter.timer)
      tokenWaiters = tokenWaiters.filter((item) => item !== waiter)
      reject(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

function resolveTokenWaiters(token: string): void {
  const waiters = tokenWaiters
  tokenWaiters = []
  for (const waiter of waiters) {
    clearTimeout(waiter.timer)
    waiter.resolve(token)
  }
}

function rejectTokenWaiters(error: Error): void {
  const waiters = tokenWaiters
  tokenWaiters = []
  for (const waiter of waiters) {
    clearTimeout(waiter.timer)
    waiter.reject(error)
  }
}

async function persistToken(
  token: string,
  previous: string | null,
): Promise<boolean> {
  if (previous && previous !== token) {
    // Retire the old token for this member only (the RPC scopes by auth.uid()).
    await unregisterDeviceToken(previous).catch(() => undefined)
  }
  return saveToken(token)
}

async function saveToken(token: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  // Never register a token for a signed-out visitor.
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return false

  const deviceId = await getDeviceId()
  const { error } = await supabase.rpc(RPC.memberRegisterDeviceToken, {
    p_token: token,
    p_platform: 'android',
    p_device_id: deviceId,
  })

  if (error) {
    console.error('Failed to register device token:', error.message)
    return false
  }
  return true
}

async function getDeviceId(): Promise<string | null> {
  try {
    const capacitor = (window as unknown as {
      Capacitor?: {
        Plugins?: {
          Device?: { getId?: () => Promise<{ uuid?: string }> }
        }
      }
    }).Capacitor
    if (capacitor?.Plugins?.Device?.getId) {
      const { uuid } = await capacitor.Plugins.Device.getId()
      return typeof uuid === 'string' && uuid.length > 0 ? uuid : null
    }
  } catch {
    // The Device plugin is not installed; the token alone is sufficient.
  }
  return null
}

/** Check whether the current platform supports FCM push (Android native only). */
export function supportsFcmPush(): boolean {
  return isNativePlatform()
}
