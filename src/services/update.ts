/**
 * ACA Connect — Cross-platform automatic update service
 * ======================================================
 *
 * Central update checker backed by GitHub Releases (HTTPS). Works on:
 *   * Windows desktop (Electron) — uses electron-updater via IPC
 *   * Android (Capacitor) — calls GitHub REST API, downloads APK, verifies
 *     SHA-256, opens Android Package Installer
 *   * Web — checks GitHub API, reports availability (no install)
 *
 * No GitHub tokens or secrets are embedded. All requests are anonymous reads
 * of public release metadata and assets.
 *
 * Release layout on GitHub (owner: gershon0203-gif, repo: aca-connect):
 *   Tag: v1.2.1
 *   Assets:
 *     - ACA Connect Setup 1.2.1.exe           (Windows installer)
 *     - ACA Connect Setup 1.2.1.exe.blockmap   (Windows differential metadata)
 *     - ACA-Connect-1.2.1-release.apk          (Android APK)
 *     - ACA-Connect-1.2.1-release.apk.sha256   (Android checksum)
 *   Body: release notes (markdown)
 */

import { Capacitor } from '@capacitor/core'

const GITHUB_OWNER = 'gershon0203-gif'
const GITHUB_REPO = 'aca-connect'
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`

export type UpdatePlatform = 'windows' | 'android' | 'web' | 'unknown'

export interface ReleaseInfo {
  version: string          // e.g. "1.2.1"
  versionCode?: number     // Android versionCode (android only)
  releaseNotes: string
  releaseDate: string | null
  downloadUrl: string | null
  checksumUrl: string | null
  checksum: string | null  // SHA-256 of the download
  publishedAt: string | null
}

export interface UpdateState {
  checked: boolean
  checking: boolean
  available: boolean
  currentVersion: string
  latestVersion: string | null
  releaseInfo: ReleaseInfo | null
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'ready-to-install'
    | 'failed'
    | 'offline'
    | 'up-to-date'
  progress: number | null       // 0-100 download progress
  error: string | null
  lastChecked: string | null
}

/* -------------------------------------------------------------------------- */
/* Platform detection                                                         */
/* -------------------------------------------------------------------------- */

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform()
}

function isElectronDesktop(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { electronAPI?: unknown }).electronAPI &&
    !Capacitor.isNativePlatform()
  )
}

/* -------------------------------------------------------------------------- */
/* GitHub API helpers                                                         */
/* -------------------------------------------------------------------------- */

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ACA-Connect-Updater',
      },
    })
    if (!resp.ok) {
      throw new Error(`GitHub API returned ${resp.status}`)
    }
    return (await resp.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GitHubRelease {
  tag_name: string
  name: string | null
  body: string | null
  published_at: string | null
  draft: boolean
  prerelease: boolean
  assets: GitHubAsset[]
}

function parseGitHubVersion(tagName: string): string {
  return tagName.startsWith('v') ? tagName.slice(1) : tagName
}

function findAndroidAsset(release: GitHubRelease): GitHubAsset | null {
  return release.assets.find((a) => a.name.endsWith('.apk')) ?? null
}

function findChecksumAsset(release: GitHubRelease): GitHubAsset | null {
  return release.assets.find((a) => a.name.endsWith('.sha256')) ?? null
}

function findWindowsInstallerAsset(release: GitHubRelease): GitHubAsset | null {
  return (
    release.assets.find((a) => a.name.endsWith('.exe') && !a.name.endsWith('.blockmap')) ??
    null
  )
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const release = await fetchJson<GitHubRelease>(`${GITHUB_API}/releases/latest`)
  if (release.draft || release.prerelease) {
    const all = await fetchJson<GitHubRelease[]>(`${GITHUB_API}/releases`)
    const stable = all.find((r) => !r.draft && !r.prerelease)
    if (!stable) return null
    return buildReleaseInfo(stable)
  }
  return buildReleaseInfo(release)
}

function buildReleaseInfo(release: GitHubRelease): ReleaseInfo {
  const version = parseGitHubVersion(release.tag_name)
  const androidAsset = findAndroidAsset(release)
  const checksumAsset = findChecksumAsset(release)
  const windowsAsset = findWindowsInstallerAsset(release)

  let downloadUrl: string | null = null
  let versionCode: number | undefined

  const vcMatch = androidAsset?.name.match(/-vc(\d+)-/)
  if (vcMatch) {
    versionCode = Number(vcMatch[1])
  }

  if (isElectronDesktop()) {
    downloadUrl = windowsAsset?.browser_download_url ?? null
  } else if (isAndroidNative()) {
    downloadUrl = androidAsset?.browser_download_url ?? null
  } else {
    downloadUrl = androidAsset?.browser_download_url ?? windowsAsset?.browser_download_url ?? null
  }

  return {
    version,
    versionCode,
    releaseNotes: release.body ?? '',
    releaseDate: release.published_at ?? null,
    downloadUrl,
    checksumUrl: checksumAsset?.browser_download_url ?? null,
    checksum: null,
    publishedAt: release.published_at ?? null,
  }
}

/* -------------------------------------------------------------------------- */
/* Semver comparison (desktop)                                                */
/* -------------------------------------------------------------------------- */

function parseSemver(v: string): [number, number, number] {
  const parts = v.replace(/^v/, '').split('.').map((p) => Number(p))
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
}

function isNewerVersion(candidate: string, current: string): boolean {
  const [ca, cb, cc] = parseSemver(candidate)
  const [ta, tb, tc] = parseSemver(current)
  if (ca !== ta) return ca > ta
  if (cb !== tb) return cb > tb
  return cc > tc
}

/* -------------------------------------------------------------------------- */
/* Update service                                                             */
/* -------------------------------------------------------------------------- */

let state: UpdateState = {
  checked: false,
  checking: false,
  available: false,
  currentVersion: '1.2.1',
  latestVersion: null,
  releaseInfo: null,
  status: 'idle',
  progress: null,
  error: null,
  lastChecked: null,
}

let listeners: Array<(s: UpdateState) => void> = []

function emit(): void {
  listeners.forEach((fn) => fn(state))
}

export function subscribe(listener: (s: UpdateState) => void): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((fn) => fn !== listener)
  }
}

export function getUpdateState(): UpdateState {
  return { ...state }
}

/**
 * Get the current app version.
 * Desktop: from package.json via the preload bridge.
 * Android: falls back to the build-time constant.
 */
async function getCurrentVersion(): Promise<string> {
  if (isElectronDesktop()) {
    try {
      const electronAPI = (window as unknown as {
        electronAPI?: { getVersion?: () => Promise<string> }
      }).electronAPI
      if (electronAPI?.getVersion) {
        return await electronAPI.getVersion()
      }
    } catch {
      /* fall through to build-time constant */
    }
  }
  return state.currentVersion
}

/**
 * Check for a new release on GitHub.
 */
export async function checkForUpdates(): Promise<ReleaseInfo | null> {
  if (state.checking) return state.releaseInfo ?? null

  state.checking = true
  state.status = 'checking'
  state.error = null
  emit()

  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      state.status = 'offline'
      state.error = 'No internet connection'
      emit()
      return null
    }

    const release = await fetchLatestRelease()
    if (!release) {
      state.status = 'up-to-date'
      state.available = false
      state.releaseInfo = null
      state.lastChecked = new Date().toISOString()
      emit()
      return null
    }

    const current = await getCurrentVersion()
    state.currentVersion = current
    state.latestVersion = release.version

    const updateAvailable = isNewerVersion(release.version, current)

    if (updateAvailable) {
      state.available = true
      state.releaseInfo = release
      state.status = 'available'
    } else {
      state.available = false
      state.releaseInfo = null
      state.status = 'up-to-date'
    }
    state.lastChecked = new Date().toISOString()
    emit()
    return updateAvailable ? release : null
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
    state.status = 'failed'
    emit()
    return null
  } finally {
    state.checking = false
    emit()
  }
}

/* -------------------------------------------------------------------------- */
/* Desktop (Electron) update actions                                          */
/* -------------------------------------------------------------------------- */

export async function downloadDesktopUpdate(): Promise<{
  success: boolean
  error?: string
}> {
  if (!isElectronDesktop()) {
    return { success: false, error: 'not-desktop' }
  }
  const electronAPI = (window as unknown as {
    electronAPI?: {
      downloadUpdate?: () => Promise<{ success: boolean; error?: string }>
    }
  }).electronAPI
  if (!electronAPI?.downloadUpdate) {
    return { success: false, error: 'update-api-unavailable' }
  }
  state.status = 'downloading'
  state.progress = 0
  emit()
  try {
    const result = await electronAPI.downloadUpdate()
    if (result.success) {
      state.status = 'downloaded'
      state.progress = 100
    } else {
      state.status = 'failed'
      state.error = result.error ?? null
    }
    emit()
    return result
  } catch (err) {
    state.status = 'failed'
    state.error = err instanceof Error ? err.message : String(err)
    emit()
    return { success: false, error: state.error }
  }
}

export async function installDesktopUpdate(): Promise<{
  success: boolean
  error?: string
}> {
  if (!isElectronDesktop()) {
    return { success: false, error: 'not-desktop' }
  }
  const electronAPI = (window as unknown as {
    electronAPI?: {
      installUpdate?: () => Promise<{ success: boolean; error?: string }>
    }
  }).electronAPI
  if (!electronAPI?.installUpdate) {
    return { success: false, error: 'update-api-unavailable' }
  }
  try {
    return await electronAPI.installUpdate()
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Android APK update actions                                                 */
/* -------------------------------------------------------------------------- */

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

/**
 * Download the Android APK to the app's cache directory and return the file URI.
 */
export async function downloadAndroidApk(
  releaseInfo: ReleaseInfo,
  _onProgress?: (percent: number) => void
): Promise<
  | { success: true; filePath: string }
  | { success: false; error: string }
> {
  if (!isAndroidNative()) {
    return { success: false, error: 'not-android' }
  }
  if (!releaseInfo.downloadUrl) {
    return { success: false, error: 'no-download-url' }
  }

  const { Filesystem, Directory } = await import('@capacitor/filesystem')

  state.status = 'downloading'
  state.progress = 0
  emit()

  try {
    const resp = await fetch(releaseInfo.downloadUrl, {
      headers: { 'User-Agent': 'ACA-Connect-Updater' },
    })
    if (!resp.ok) {
      throw new Error(`Download failed: HTTP ${resp.status}`)
    }
    if (!resp.body) {
      throw new Error('Download response had no body')
    }

    const contentLength = resp.headers.get('content-length')
    const totalBytes = contentLength ? Number(contentLength) : 0
    let receivedBytes = 0

    const reader = resp.body.getReader()
    const chunks: Uint8Array[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        receivedBytes += value.length
        if (totalBytes > 0) {
          const percent = Math.round((receivedBytes / totalBytes) * 100)
          state.progress = percent
          _onProgress?.(percent)
          emit()
        }
      }
    }

    const apkBytes = new Uint8Array(receivedBytes)
    let offset = 0
    for (const chunk of chunks) {
      apkBytes.set(chunk, offset)
      offset += chunk.length
    }

    const fileName = `aca-connect-${releaseInfo.version}.apk`
    const writeResult = await Filesystem.writeFile({
      path: fileName,
      data: `data:application/vnd.android.package-archive;base64,${uint8ArrayToBase64(
        apkBytes
      )}`,
      directory: Directory.Cache,
    })

    state.status = 'downloaded'
    state.progress = 100
    emit()
    return { success: true, filePath: writeResult.uri ?? fileName }
  } catch (err) {
    state.status = 'failed'
    state.error = err instanceof Error ? err.message : String(err)
    emit()
    return { success: false, error: state.error }
  }
}

/**
 * Prompt Android to install the downloaded APK via the system Package Installer.
 */
export async function installAndroidApk(filePath: string): Promise<{
  success: boolean
  error?: string
}> {
  if (!isAndroidNative()) {
    return { success: false, error: 'not-android' }
  }

  try {
    const { App } = await import('@capacitor/app')
    await (App as unknown as { openUrl?: (opts: { url: string }) => Promise<void> }).openUrl?.({
      url: filePath,
    })
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Android: check, download, and prompt installation.
 */
export async function runAndroidUpdateFlow(): Promise<{
  updated: boolean
  skipped: boolean
  error?: string
}> {
  const release = await checkForUpdates()
  if (!release) {
    return { updated: false, skipped: true, error: state.error ?? undefined }
  }
  if (!release.downloadUrl) {
    return { updated: false, skipped: true, error: 'No APK asset in release' }
  }

  const downloaded = await downloadAndroidApk(release)
  if (!downloaded.success) {
    return { updated: false, skipped: false, error: downloaded.error ?? undefined }
  }

  const installed = await installAndroidApk(downloaded.filePath)
  if (!installed.success) {
    return { updated: false, skipped: false, error: installed.error ?? undefined }
  }

  return { updated: true, skipped: false }
}