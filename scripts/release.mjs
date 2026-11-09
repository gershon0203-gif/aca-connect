/**
 * ACA Connect — Release helper script
 * ====================================
 *
 * Assists with preparing a new release for both Windows desktop and Android.
 * This script does NOT publish automatically — it verifies the build, generates
 * checksums, and prints the exact commands you need to run to publish.
 *
 * Usage:
 *   node scripts/release.mjs <version>
 *
 * Example:
 *   node scripts/release.mjs 1.2.2
 *
 * This will:
 *   1. Verify package.json version matches the argument
 *   2. Verify Android versionCode/versionName in android/app/build.gradle
 *   3. Confirm the build artifacts exist
 *   4. Generate SHA-256 checksums for all release artifacts
 *   5. Print the GitHub release commands to run
 *
 * Never automatically publishes — you must review and run the publish steps.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const REPO_OWNER = 'gershon0203-gif'
const REPO_NAME = 'aca-connect'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/release.mjs <version>')
  console.error('Example: node scripts/release.mjs 1.2.2')
  process.exit(1)
}

const versionRegex = /^\d+\.\d+\.\d+$/
if (!versionRegex.test(version)) {
  console.error(`Invalid version "${version}". Expected format: X.Y.Z (e.g. 1.2.2)`)
  process.exit(1)
}

const tagName = `v${version}`

let errors = 0
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    errors++
  }
}

console.log(`\nACA Connect Release Preparation — v${version}\n`)

// ---------------------------------------------------------------------------
// 1. Verify package.json version
// ---------------------------------------------------------------------------
console.log('1. package.json version')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
check(`package.json version is ${version}`, pkg.version === version, ` (found ${pkg.version})`)
if (pkg.version !== version) {
  console.log(`    Update: npm version ${version} --no-git-tag-version`)
}

// ---------------------------------------------------------------------------
// 2. Verify Android versionName/versionCode
// ---------------------------------------------------------------------------
console.log('\n2. Android build configuration')
const buildGradle = readFileSync('android/app/build.gradle', 'utf8')
const vnMatch = buildGradle.match(/versionName\s+"([^"]+)"/)
const vcMatch = buildGradle.match(/versionCode\s+(\d+)/)
const androidVersionName = vnMatch ? vnMatch[1] : null
const androidVersionCode = vcMatch ? Number(vcMatch[1]) : null

check(`Android versionName is ${version}`, androidVersionName === version, ` (found ${androidVersionName})`)
if (androidVersionName !== version) {
  console.log(`    Update versionName in android/app/build.gradle to "${version}"`)
}

check(`Android versionCode is set`, androidVersionCode !== null && androidVersionCode > 0, ` (found ${androidVersionCode})`)
if (androidVersionCode) {
  console.log(`    Current versionCode: ${androidVersionCode}`)
  console.log(`    Bump versionCode in android/app/build.gradle before release`)
}

// ---------------------------------------------------------------------------
// 3. Verify build artifacts exist
// ---------------------------------------------------------------------------
console.log('\n3. Build artifacts')

const webDistExists = existsSync('dist')
check('Web build (dist/) exists', webDistExists)
if (!webDistExists) {
  console.log('    Run: npm run build')
}

const electronMainExists = existsSync('dist-electron/main.cjs') || existsSync('dist-electron/main.js')
check('Electron main built (dist-electron/) exists', electronMainExists)
if (!electronMainExists) {
  console.log('    Run: npm run electron:main')
}

const androidApkExists = existsSync('android/app/build/outputs/apk/release/app-release-unsigned.apk')
check('Android release APK exists', androidApkExists)
if (!androidApkExists) {
  console.log('    Run: cd android && .\\gradlew.bat assembleRelease')
}

// ---------------------------------------------------------------------------
// 4. Generate checksums
// ---------------------------------------------------------------------------
console.log('\n4. SHA-256 checksums')

function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

const releaseDir = 'release/android'
const windowsDir = 'release/windows'

if (existsSync(releaseDir)) {
  const apks = readdirSync(releaseDir).filter((f) => f.endsWith('.apk'))
  for (const apk of apks) {
    const path = join(releaseDir, apk)
    const hash = sha256File(path)
    console.log(`  ${apk}:`)
    console.log(`    SHA-256: ${hash}`)
    console.log(`    Save to: ${path}.sha256`)
  }
}

if (existsSync(windowsDir)) {
  const exes = readdirSync(windowsDir).filter((f) => f.endsWith('.exe'))
  for (const exe of exes) {
    const path = join(windowsDir, exe)
    const hash = sha256File(path)
    console.log(`  ${exe}:`)
    console.log(`    SHA-256: ${hash}`)
    console.log(`    Save to: ${path}.sha256`)
  }
}

// ---------------------------------------------------------------------------
// 5. Print publish commands
// ---------------------------------------------------------------------------
console.log('\n6. GitHub Release publish steps')
console.log(`   Tag: ${tagName}`)
console.log(`   Repo: https://github.com/${REPO_OWNER}/${REPO_NAME}\n`)

console.log('   A. Create the GitHub Release:')
console.log(`     gh release create ${tagName} \\`)
console.log(`       --title "ACA Connect ${version}" \\`)
console.log(`       --notes-file release-notes-${version}.md \\`)

if (existsSync(windowsDir)) {
  const exes = readdirSync(windowsDir).filter((f) => f.endsWith('.exe'))
  for (const exe of exes) {
    console.log(`       ${join(windowsDir, exe)} \\`)
    const blockmap = exe + '.blockmap'
    if (existsSync(join(windowsDir, blockmap))) {
      console.log(`       ${join(windowsDir, blockmap)} \\`)
    }
  }
}

if (existsSync(releaseDir)) {
  const apks = readdirSync(releaseDir).filter((f) => f.endsWith('.apk'))
  for (const apk of apks) {
    console.log(`       ${join(releaseDir, apk)} \\`)
    if (existsSync(join(releaseDir, apk + '.sha256'))) {
      console.log(`       ${join(releaseDir, apk + '.sha256')} \\`)
    }
  }
}

console.log('')

console.log('   B. Or use the GitHub web UI:')
console.log(`     https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/new`)
console.log(`     Tag: ${tagName}`)
console.log(`     Target: main`)
console.log(`     Title: ACA Connect ${version}`)
console.log('     Attach: Windows .exe + .blockmap, Android .apk + .sha256')
console.log('     Release notes: describe the changes')
console.log('     ⚠️  Do NOT mark as pre-release or draft')

console.log('\n7. After publishing:')
console.log('   - Windows users will be notified on next app start (electron-updater)')
console.log('   - Android users will see the update in the App Updates section')
console.log('   - Verify both update channels work before announcing')

if (errors > 0) {
  console.error(`\n${errors} issue(s) found. Fix them before releasing.\n`)
  process.exit(1)
}

console.log('\nAll checks passed. Ready to release.\n')