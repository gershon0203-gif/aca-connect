# ACA Connect — Release Guide

This document explains how to publish a new version of ACA Connect for both
Windows desktop and Android.

## Prerequisites

- Node.js and npm installed
- Android SDK installed (for building the APK)
- GitHub CLI (`gh`) installed and authenticated (optional — can use web UI)
- Access to the GitHub repository: https://github.com/gershon0203-gif/aca-connect

**Never publish automatically without review.** This guide walks through
manual steps you control.

---

## Release Checklist

Before every release:

1. [ ] Update `package.json` version (desktop)
2. [ ] Update `android/app/build.gradle` versionName and versionCode (Android)
3. [ ] Build web: `npm run build`
4. [ ] Build Windows installer: `npm run electron:installer`
5. [ ] Build Android release APK: `cd android && .\gradlew.bat assembleRelease`
6. [ ] Generate SHA-256 checksums
7. [ ] Create GitHub Release with all artifacts
8. [ ] Verify updates work on both platforms

---

## Step-by-Step Release

### Step 1: Update versions

**Desktop (package.json):**
```powershell
npm version 1.2.2 --no-git-tag-version
```

**Android (android/app/build.gradle):**
Edit `versionName` and `versionCode`:
```gradle
defaultConfig {
    applicationId "org.acapozhichalur.connect"
    versionCode 6          # increment for every release
    versionName "1.2.2"    # match package.json
    ...
}
```

### Step 2: Build

```powershell
# Web build
npm run build

# Electron main + Windows installer
npm run electron:installer

# Android release APK
cd android
.\gradlew.bat assembleRelease
cd ..
```

Artifacts produced:

| Platform | Artifact | Location |
|----------|----------|----------|
| Windows | Installer | `release/windows/ACA Connect Setup X.Y.Z.exe` |
| Windows | Blockmap | `release/windows/ACA Connect Setup X.Y.Z.exe.blockmap` |
| Android | APK | `release/android/ACA-Connect-X.Y.Z-release.apk` |

### Step 3: Generate checksums

```powershell
node scripts/release.mjs 1.2.2
```

This verifies versions, lists artifacts, and prints SHA-256 hashes. Save each
hash to a `.sha256` file next to its artifact:

```
release/windows/ACA Connect Setup 1.2.2.exe.sha256
release/android/ACA-Connect-1.2.2-release.apk.sha256
```

### Step 4: Create GitHub Release

Using GitHub CLI:
```powershell
gh release create v1.2.2 `
  --title "ACA Connect 1.2.2" `
  --notes-file release-notes-1.2.2.md `
  "release/windows/ACA Connect Setup 1.2.2.exe" `
  "release/windows/ACA Connect Setup 1.2.2.exe.blockmap" `
  "release/android/ACA-Connect-1.2.2-release.apk" `
  "release/android/ACA-Connect-1.2.2-release.apk.sha256"
```

Or via web UI:
https://github.com/gershon0203-gif/aca-connect/releases/new

**Important:**
- Tag: `v1.2.2`
- Target: `main`
- Title: `ACA Connect 1.2.2`
- **Do NOT** mark as pre-release or draft
- Attach all artifacts listed above

### Step 5: Verify

After publishing:

1. Install the new version on a test Windows machine — confirm update notification appears
2. Install the new APK on a test Android device — confirm in-app update check works
3. Confirm existing user data and settings are preserved
4. Announce the release to users

---

## Rollback

If a release has issues:

1. Do not delete the GitHub Release (this breaks update checks for users who already downloaded it)
2. Publish a new version with the fix
3. Users will receive the new version through the normal update flow

---

## Security

- All downloads are over HTTPS
- GitHub Releases are the only trusted source
- Android APKs are verified against published SHA-256 checksums
- The signing certificate never changes between releases
- No access tokens are embedded in the app

---

## Troubleshooting

**Update check fails on Windows:**
- Verify the app is running a packaged build (not `npm run dev`)
- Check GitHub Release exists and is not a draft/prerelease
- Verify `electron-builder.json` has the correct `publish` config

**Update check fails on Android:**
- Verify the device has internet access
- Verify the GitHub Release has an `.apk` asset
- Check Android logcat for update service errors

**Checksum mismatch:**
- Re-download the artifact and regenerate the `.sha256` file
- Verify the GitHub Release asset wasn't corrupted during upload