# ACA Connect v1.2.1

## What's New

### Automatic Updates (Windows + Android)
- **Windows desktop:** Automatic update checks on startup and every 6 hours while running. Updates are downloaded securely via `electron-updater` from GitHub Releases and installed with a single "Restart & install" click.
- **Android:** In-app update check on startup and in Settings → App updates. Downloads the latest APK over HTTPS, verifies its SHA-256 checksum, and opens the Android Package Installer for user-confirmed installation.

### App Updates Section
- New "App updates" card in Settings showing current version, latest version, release notes, download progress, and install action.
- Manual "Check for updates" button available at any time.

### Notification Fixes
- FCM token rotation is now detected on every app launch, so push notifications reliably arrive even after token refresh.
- Android notification channels remain versioned (`aca_attendance_v2`, `aca_prayer_v2`, `aca_chat_v2`, `aca_general_v2`) with heads-up popups, sound, and vibration.

## Installation

### Windows
Download and run `ACA Connect Setup 1.2.1.exe`. The installer upgrades over the previous version automatically — your data and settings are preserved.

### Android
Download and install `ACA-Connect-1.2.1-release.apk` over your existing installation. Your data, login, and settings are preserved.

## Assets

| Platform | Asset | SHA-256 |
|----------|-------|---------|
| Windows | `ACA Connect Setup 1.2.1.exe` | `9C68EAD1A3664C340D54718B4A5959395C65D36C7EE1E5423D1B0D48DA3AD1F7` |
| Windows | `.exe.blockmap` | `BB3FD90A73ABD85E48CD3D3582D0E32859A512343EEEFCD2D9167307B5F3B7DD` |
| Android | `ACA-Connect-1.2.1-release.apk` | `0A0E3585FE38A55175418EB5FC949162F1649FD6950BE68DF75C10BE93391A6F` |

## Signing
- Windows installer: Not code-signed (no certificate configured).
- Android APK: Signed with the existing debug keystore (`CN=Android Debug`). Same certificate as v1.2.0 — update-compatible.
