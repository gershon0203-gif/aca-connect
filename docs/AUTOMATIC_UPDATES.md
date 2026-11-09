# ACA Connect — Automatic Updates

This document explains how the automatic update system works for ACA Connect,
for both Windows desktop and Android users.

## Overview

Whenever a new version is released, existing users are notified and can
download and install the update without manually searching for it.

- **Windows desktop:** Uses `electron-updater` with GitHub Releases.
- **Android:** Uses an in-app update check that downloads the APK from GitHub
  Releases and opens the Android Package Installer.
- **All communication is over HTTPS.**
- **No access tokens or secrets are embedded in the app.**

---

## Windows Desktop Updates

### How it works

1. The app checks for updates when it starts.
2. It checks again every 6 hours while running.
3. If a new stable release is published on GitHub, the user sees a notification.
4. The user can download the update in the background (with progress shown).
5. When the download completes, the user chooses to restart and install.
6. `electron-updater` installs the NSIS update and reopens ACA Connect.
7. All user data and settings are preserved.

### Update flow

| Step | What happens |
|------|--------------|
| Startup | Silent check for updates (no UI interruption) |
| Update available | "App Updates" card in Settings shows "Update available" |
| Download | Background download with progress bar |
| Downloaded | "Restart & install" button appears |
| Install | App closes, NSIS installer runs, app reopens |

### Manual check

Users can click **"Check for updates"** in Settings → App updates at any time.

### Offline behavior

If the device is offline, the update check shows "No internet connection" and
retries automatically when connectivity returns.

---

## Android Updates

### How it works

1. The app checks for a new APK on GitHub Releases when it starts.
2. It also checks when the user opens Settings → App updates.
3. If a newer versionCode is available, the user sees the latest version and
   release notes.
4. The user taps **"Download update"** — the APK downloads over HTTPS.
5. The downloaded APK's SHA-256 checksum is verified against the published
   checksum file.
6. The user taps **"Install now"** — Android opens the system Package Installer.
7. The user confirms installation (Android requires this for APKs outside
   Google Play).
8. The app reopens — all data, login, and settings are preserved.

### Android security

- **No silent installation:** Android always requires user confirmation to
  install an APK from outside Google Play.
- **Install unknown apps:** The first time, the user may need to enable
  "Install unknown apps" for ACA Connect in Android Settings.
- **No root required.**
- **Package ID and signing certificate never change.** Updates are signed with
  the same keystore as the original installation.
- **Checksum verification:** Every download is verified against the published
  SHA-256 checksum before installation.

---

## Update Statuses

| Status | Meaning |
|--------|---------|
| Up to date | You have the latest version |
| Update available | A new version is ready to download |
| Downloading | Update is being downloaded (progress shown) |
| Update downloaded | Download complete, ready to install |
| Ready to install | Click "Restart & install" (Windows) or "Install now" (Android) |
| Update failed | Download or verification failed — tap Retry |
| No internet connection | Device is offline — check will retry when online |

---

## Where updates are published

All releases are published to:

- **GitHub:** https://github.com/gershon0203-gif/aca-connect/releases

Only stable releases (not drafts or pre-releases) trigger update notifications.

---

## Version numbering

| Platform | Version field | Example |
|----------|--------------|---------|
| Windows desktop | `package.json` version | `1.2.1` |
| Android | `versionName` / `versionCode` | `1.2.1` / `5` |
| GitHub tag | `v` prefix | `v1.2.1` |

Windows and Android share the same version number (e.g. `1.2.1`), but Android
also has a separate `versionCode` integer that must be incremented for every
release.