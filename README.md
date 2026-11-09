# ACA Connect

A premium church member management platform for **ACA Pozhichalur Ministries**.

This repository contains the **foundation stage**, a complete **member
management** interface and a **live Supabase backend integration**: a
responsive, accessible front-end shell with routing, layout, reusable
components, a clean data layer and full create / read / update / delete for the
church directory — backed by Postgres with Row Level Security, Supabase Auth,
and a private photo bucket.

> ⚠️ **Runs on demo data until you configure Supabase.** With no credentials the
> app serves fabricated records marked "Demo data" in the UI and touches no
> network. Once `.env.local` holds real credentials and `VITE_USE_DEMO_DATA=false`
> the same UI reads and writes your live project — no component changes needed.
>
> Demo add / edit / remove is **honest**: it mutates an isolated in-memory
> working copy (`src/services/demo-store.ts`), the list and profile genuinely
> reflect the change, and each screen states the record lives only in this
> session. Nothing is presented as saved to a database.

---

## Stack

| Concern        | Choice                                    |
| -------------- | ----------------------------------------- |
| Framework      | React 19 + Vite + TypeScript              |
| Styling        | Tailwind CSS v4 (CSS-first theme tokens)  |
| Icons          | lucide-react                              |
| Routing        | react-router-dom v7                       |
| Backend client | @supabase/supabase-js                     |
| PWA            | vite-plugin-pwa (Workbox) → installable web app |
| Native shell   | Capacitor 8 → Android app (same codebase)  |

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check (tsc) + production build
npm run preview  # preview the production build
npm run lint     # oxlint
```

Open the printed local URL. You will land on `/login`.

### Demo sign-in

With no Supabase credentials the sign-in screen is a **demo gate**, not real
authentication:

```
Email:    pastor@acapozhichalur.org
Password: grace2026
```

Use the **"Fill demo details"** button on the login card to populate it. Once a
backend is configured the demo card disappears and sign-in uses Supabase Auth.

---

## Routes

| Route              | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `/login`           | Split-screen sign-in with validation                       |
| `/forgot-password` | Request a password-reset email (Supabase Auth)             |
| `/reset-password`  | Set a new password from the recovery link                 |
| `/accept-invitation` | Public landing page that redeems an invitation token    |
| `/dashboard`       | Stats, recent members, ministries, activity feed          |
| `/members`         | Searchable directory with filters, card/table views and CRUD |
| `/members/:id`     | Full member profile with edit and remove                     |
| `/attendance`      | Attendance register: sessions list + create (super admin)   |
| `/attendance/:id`  | Marking sheet, completion and manual absentee reminders     |
| `/my-attendance`   | Member portal: own attendance report and calendar (member)  |
| `/prayers`         | Prayer categories, requests and manual reminders (super admin) |
| `/notifications`   | In-app inbox for every role; delivery history for super admin |
| `/my-profile`      | Signed-in user's account, photo and password              |
| `/my-family`       | Member portal: the caller's household(s) (member role only) |
| `/admin/users`     | Super-admin-only user, role and invitation management     |
| `/settings`        | Super-admin-only church profile, member fields, notifications, data & session |

Unmatched routes render a 404 page. Protected routes redirect to `/login` and
return you to the page you requested after signing in.

---

## Member management

The `/members` directory is the heart of the app.

- **Search** by name, email or member ID (also driven by the header search).
- **Filter** by membership status, ministry and family, with a one-tap clear.
- **Card view** for phones and **table view** for desktop (toggle on large
  screens; cards are used automatically on small screens).
- **Add / edit / remove** members, gated by role — only `super_admin` sees
  mutation controls; a `member` sees only their own linked record.
- **Automatic unique member IDs** (`ACA-0001`, `ACA-0002`, …) proposed on
  create; duplicate IDs are rejected in the form *and* again in the data layer.
- **Validated forms** with inline errors, required-field rules, date and contact
  checks, live avatar preview, and ministry chips.
- **Confirmation dialog** before any member is removed.
- **Honest states** everywhere: loading skeletons, empty states (distinguishing
  "no matches" from "no members"), and success / failure toasts that reflect
  what actually happened.

### Data-access contract

All member reads and writes flow through `src/services/members.ts`. These
functions either persist the change and return the saved record, or throw — there
is no code path that reports success without applying it. The UI renders the
Supabase branch when credentials are configured and the isolated demo store
otherwise, so swapping backends touches this file alone.

### Configurable fields

`src/config/member-fields.ts` defines every member field with sensible defaults:
which fields are always shown, which an administrator may hide, which are
optional, and which are sensitive. The resolved settings drive both the member
form and the member profile. Administrators can adjust visibility and
requirement under **Settings → Member fields**; preferences are stored per device
in `localStorage` and never touch church records. Locked identity fields
(`id`, `firstName`, `lastName`, membership date, status) cannot be hidden or made
optional.

---

## Member portal & invitations

A linked member gets a small, self-contained portal:

| Route         | What it does                                                        |
| ------------- | ------------------------------------------------------------------- |
| `/my-profile` | Account + **My church record** (verified once linked), edit approved fields, change password, sign out |
| `/my-family`  | Household(s) the member belongs to — authorized fields only         |
| `/my-attendance` | Own attendance percentage, present/absent counts, month calendar and session history |
| `/notifications` | In-app attendance and prayer reminders (read/unread)              |
| `/accept-invitation` | Redeems an invitation token and links the account         |

### States

Every portal surface renders an explicit state: **loading** (skeletons),
**pending** (signed in but not yet linked — no member data is shown),
**expired/invalid** (invitation), **error** (with retry) and **success**. A
profile is only ever shown as *Verified* after the account is linked to a
member record; until then it reads *Not verified yet*.

### Invitation workflow

1. An authorized **super_admin** opens a member record and chooses **Invite to
   portal** (or uses **Admin → Users**), entering the invitee's email.
2. A secure server-side path creates the invitation and emails the link:
   - The **`send-invitation` Edge Function** verifies the caller's JWT and
     `super_admin` role, creates the invitation row, and sends the email.
   - Without the function deployed, the same row is created directly through
     RLS (super_admin-only) and the admin copies the one-time link to share.
3. The invitee establishes authentication (email verification / password) and
   lands on `/accept-invitation?token=…`, where the **`accept_invitation`** RPC
   re-validates the token, the invited email and the role, then links the
   account to the intended member record.
4. Invitations **expire** (7 days) and are **single-use** — the token is marked
   `accepted`/`revoked`/`expired` and can never be reused.

### Recovery

- **Wrong email / changed address:** *Admin → Users → Invitations → Reissue*
  calls the `reissue_invitation` RPC, which revokes the old token and issues a
  fresh one for the corrected address.
- **Wrong or duplicate link:** a super_admin opens the member record and chooses
  **Unlink account** (`admin_unlink_member`), then issues a fresh invitation.
- **Duplicate linkage is impossible:** `members.user_id` is `UNIQUE`, and the
  linking RPCs refuse a member that is already linked to another account.

### Required Supabase configuration

- **Email / SMTP:** Dashboard → Authentication → Emails (or SMTP). Without this
  the `send-invitation` function still creates the invitation but cannot email;
  admins can share the link manually.
- **Redirect URLs:** add `<app-url>/accept-invitation` and
  `<app-url>/reset-password` to Authentication → URL Configuration → Redirect
  URLs, and set the Site URL.
- **Disable public sign-ups:** Authentication → Providers → Email → uncheck
  *Allow new users to sign up*. New accounts get a profile but **no role** and
  can do nothing until invited.
- **Deploy the function:**
  ```bash
  supabase functions deploy send-invitation
  supabase secrets set APP_URL=https://<your-app-url>
  ```

### Server-side functions

| Function / RPC          | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `get_my_family()`       | Caller's own household(s), restricted fields (no contact data) |
| `accept_invitation`     | Validates token + email + role, links the member account       |
| `reissue_invitation`    | Revokes an old invitation, issues a corrected one              |
| `admin_link_member` / `admin_unlink_member` | super_admin link management          |
| `admin_create_attendance_session` / `admin_save_attendance` / `admin_finalize_attendance` | super_admin attendance sheet workflow |
| `admin_send_attendance_reminders` / `admin_send_prayer_reminder` | Manual, in-app reminders (role re-checked, de-duplicated) |
| `mark_all_notifications_read` | Marks only the caller's own notifications read          |
| `send-invitation` (Edge)| Auth-checked invitation creation + email                       |

---

## Attendance, prayers & notifications

**Attendance** (`/attendance`, super admin) — create one session per date and
service, mark members `present` or `absent`, and complete the session. A member
who is left unmarked stays *not recorded* and is never counted as absent. The
sheet is saved in full each time, so clearing a marking removes that record.

**My attendance** (`/my-attendance`, member) — the signed-in member's own
percentage, present/absent counts, month calendar and history. The client never
sends a member id: Row Level Security scopes every row to the linked member.

**Absentee reminders** — after a session is completed, the administrator can
send an in-app reminder to absent members who have an active linked account.
Sending is always manual; sending again refreshes the same notification rather
than creating a duplicate.

**Prayers** (`/prayers`, super admin) — categories and prayer requests, with
archive/restore. No prayer content is seeded: the administrator adds the church's
real content. A manual reminder can be sent per active prayer; archived prayers
and archived categories are hidden from members.

**Notifications** (`/notifications`) — an in-app inbox for everyone, plus a
delivery history for the super admin. The header bell shows the unread count and
refreshes on focus, on app events and on a slow poll. No WhatsApp, SMS or email
is sent from these features.

---

## Project structure

```
src/
├── components/
│   ├── auth/          # RequireAuth / RequireRole route guards
│   ├── dashboard/     # StatCard and dashboard-specific UI
│   ├── layout/        # AppLayout, Sidebar, MobileNav, Header, Page
│   ├── members/       # MemberCard, MemberTable, MemberForm
│   ├── system/        # NativeBootstrap, AndroidBackButton, OfflineBanner, ErrorBoundary,
│                      # InstallAppButton, PwaUpdatePrompt
│   └── ui/            # Button, Card, Badge, FormField, Modal, ConfirmDialog,
│                      # Skeleton, EmptyState, Avatar, SearchInput, DataTable,
│                      # Switch
├── config/            # Navigation + configurable member-field definitions
├── context/           # Auth, Toast, MemberFields and Network providers (+ hooks)
├── hooks/             # useAsync data fetching + usePwaInstall (install prompt)
├── lib/
│   ├── demo-data.ts   # ⚠️ Fabricated demo records (not persisted)
│   ├── env.ts         # Central environment reader + demo-mode flag
│   ├── member-validation.ts  # Member form validation rules
│   ├── format.ts      # Date / number / name formatting
│   ├── roles.ts       # Role constants, labels and predicates
│   ├── platform.ts    # Capacitor platform helpers (native vs web)
│   ├── supabase.ts    # Lazy Supabase client + TABLES / BUCKETS / RPC names
│   └── utils.ts       # cn() class combiner
├── pages/             # One file per route
├── services/
│   ├── auth.ts        # Supabase Auth + profile/role loading + invitation RPCs
│   ├── storage.ts     # Private photo upload + signed-URL resolution
│   ├── members.ts     # Typed member CRUD (Supabase + demo branches)
│   ├── portal.ts      # Member portal: my-family (authorized subset)
│   ├── invitations.ts # Invitation create/list/revoke/reissue (super_admin only)
│   ├── demo-store.ts  # ⚠️ Isolated in-memory working copy (demo only)
│   ├── latency.ts     # Shared artificial delay for demo mode
│   └── data.ts        # Ministries / stats / activity / users
├── types/             # Shared TypeScript domain types
├── App.tsx            # Router + providers
└── main.tsx           # Entry point

supabase/
├── migrations/        # Schema, enums, functions/triggers, RLS, storage bucket, authz + portal
├── functions/         # send-invitation Edge Function (secure invite creation + email)
└── seed.sql           # ⚠️ Development seed data (mirrors the demo records)

public/
├── favicon.svg        # Browser tab icon
├── aca-logo.png       # Source logo (used to generate all app icons)
├── pwa-192x192.png    # PWA icons ("any" + "maskable") + iOS touch icon
├── pwa-512x512.png
├── pwa-maskable-192x192.png
├── pwa-maskable-512x512.png
├── apple-touch-icon.png
└── _redirects         # SPA fallback for static hosts (Netlify / Cloudflare Pages)

android/               # Capacitor 8 native Android project (committed)
assets/                # Icon + splash source images for @capacitor/assets
capacitor.config.ts    # app id, app name, webDir and plugin configuration
vite.config.ts         # Vite + React + Tailwind + VitePWA (manifest & workbox)
```

---

## Design system

Tokens live in `src/index.css` under Tailwind v4's `@theme` block:

- **Warm white** canvas — `cream-50 … cream-300`
- **Deep navy** structure — `navy-50 … navy-950`
- **Subtle gold** accents — `gold-50 … gold-900`

Typography pairs **Fraunces** (display) with **Inter** (UI). Spacing, radii and
two shadow tiers (`shadow-soft`, `shadow-lifted`) are shared across components
for a calm, consistent, professional feel. Motion is minimal and respects
`prefers-reduced-motion`.

### Included foundations

- Reusable sidebar, mobile bottom navigation, sticky header and page wrapper
- Search, member cards, generic data table, modal, form fields, badges
- Skeleton loading states, empty states and toast notifications
- Fully responsive from Android phone to desktop, with safe-area insets

---

## Connecting Supabase

The front-end is already wired to Supabase. All that is missing is a project.

### 1. Create a project

Create a project at [supabase.com](https://supabase.com) and note the project
URL and **anon** public key (Project Settings → API). Never copy the
service-role key into this app — only the anon key is bundled.

### 2. Apply the migrations

Everything lives in `supabase/migrations/` and runs in order:

| File                    | Contents                                              |
| ----------------------- | ----------------------------------------------------- |
| `*_enums.sql`           | All enum types (roles, statuses, etc.)                |
| `*_tables.sql`          | The seven tables, indexes and constraints             |
| `*_functions.sql`       | `updated_at`, signup provisioning, role helpers, audit triggers, `member_set_family` RPC |
| `*_rls.sql`             | Row Level Security policies for every table           |
| `*_storage.sql`         | The private `avatars` bucket and its object policies  |
| `2026..._authz.sql`     | Production authorization model: rebuilds role helpers, RPCs, RLS and storage policies around `super_admin`/`member` |
| `2026..._portal.sql`    | Member portal + invitation recovery: `get_my_family`, `reissue_invitation` |
| `2026..._harden_execute.sql` | Revokes anonymous `EXECUTE` on public functions (defence in depth) |
| `2026..._member_guard_trusted.sql` | Lets trusted backend roles link member accounts |
| `20261108000000_attendance_prayer_notifications.sql` | Attendance sessions/records, prayer categories/items and in-app notifications, with RLS and manual-reminder RPCs |

**Option A — SQL editor (no tooling):** open each file in order and run it in
the Supabase SQL editor.

**Option B — CLI:**

```bash
npm install -g supabase          # or: npx supabase ...
supabase init                    # creates supabase/config.toml (keeps migrations/)
supabase link --project-ref <ref>
supabase db push                 # applies migrations/
```

### 3. (Optional) Load the development seed

`supabase/seed.sql` mirrors the fabricated demo records so a fresh project looks
like the demo. It creates households and members only — **never run it against
production data.** Create your first account in step 5, then run the promote
block at the bottom of the file.

```bash
supabase db reset                # local: migrations + seed
```

### 4. Configure the app

```bash
cp .env.example .env.local
```

```dotenv
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_USE_DEMO_DATA=false
```

Restart the dev server. The demo card disappears from the login screen and all
data now comes from your project.

### 5. Create the first administrator

1. In the dashboard, open **Authentication → Users → Add user** and create an
   account (email + password). The `handle_new_user` trigger gives every new
   account a `profiles` row **but no role** — a fresh account has no access
   until it is granted one.
2. Promote that account to `super_admin`:

```sql
insert into public.user_roles (user_id, role, status)
values (
  (select id from auth.users where email = 'you@example.com'),
  'super_admin', 'active'
)
on conflict (user_id) do update
  set role = 'super_admin', status = 'active';
```

3. Turn off public sign-ups (**Authentication → Providers → Email → disable
   "Allow new users to sign up"**). Accounts are inert without a role, but
   disabling sign-ups keeps the user list clean. Everyone else joins through an
   invitation issued from **Admin → Users**.

### 6. Password-reset redirects

In **Authentication → URL Configuration**, set the Site URL and add
`<your-app-url>/reset-password` to the redirect allow-list so recovery emails
return to the app.

---

## Data model & security

Core tables (UUID primary keys, human codes kept unique):

| Table            | Purpose                                                        |
| ---------------- | ------------------------------------------------------------- |
| `profiles`       | One row per auth user (name, contact, avatar path)            |
| `user_roles`     | Role (`super_admin`/`member`) + status, one per user          |
| `families`       | Households, addressed by `code` (e.g. `FAM-001`)              |
| `members`        | Members, addressed by `member_code` (e.g. `ACA-0001`)         |
| `family_members` | Many-to-many household ↔ member link (one primary per member) |
| `member_relationships` | Typed relationships between members (spouse, parent, …)  |
| `invitations`    | Admin-issued invites                                          |
| `audit_logs`     | Append-only trail written by database triggers                |
| `attendance_sessions` | One row per (date, service); `draft` until completed      |
| `attendance_records`  | Per-member `present`/`absent` marking for a session       |
| `prayer_categories`   | Administrator-maintained prayer categories                |
| `prayer_items`        | Prayer requests inside a category (active/archived)       |
| `notifications`       | In-app reminders: read only by their recipient            |

- The front-end's `Member.id` is the human `member_code`; the UUID is an
  internal surrogate key.
- Setting a member's household goes through the `member_set_family` RPC, which
  resolves codes to UUIDs and keeps the join table consistent.
- **RLS is on for every table.** Access is enforced by `SECURITY DEFINER` role
  helpers (`is_super_admin()`, `is_staff()`, `is_member()`) that read
  `user_roles` by `auth.uid()` — the client can never supply a role.
  `is_staff()` is retained for backwards compatibility (the enum still has a
  legacy `staff` value, which no account uses); the app grants and renders only
  `super_admin` and `member`.
- Photos live in a **private** `avatars` bucket. The database stores the object
  path; the app resolves a one-hour signed URL per record at read time.
  Super admins may write anywhere in the bucket; people may write to their own
  `<user_id>/` folder or their own linked member photo.

### Authorization model

Two roles, each the minimum they need:

| Role          | Members & households        | Activity trail | Users / roles | Invitations | Settings | Storage |
| ------------- | --------------------------- | -------------- | ------------- | ----------- | -------- | ------- |
| `super_admin` | Full CRUD                   | Read           | Manage        | Manage      | Manage   | Anywhere |
| `member`      | Read + update **own** record (approved fields only) | — | — | — | — | Own folder / own photo |

Attendance, prayer and notification access is enforced the same way:

- A `super_admin` manages attendance sheets, prayer content and reminder sends.
- A `member` may read only their **own** `attendance_records` (and the session
  header they appear in) and only their **own** `notifications`. The read flag is
  the only notification column they can change.
- Reminders are **manual and in-app only** — no WhatsApp/SMS/email is sent, and
  nothing is scheduled automatically. The reminder RPCs re-check the caller's
  role server-side and de-duplicate per recipient.

Guarantees enforced **server-side**, not just in the UI:

- **No self-granted access.** `handle_new_user` provisions a profile only; the
  sole path to a role is a `super_admin` invitation (`accept_invitation`) or
  account link (`admin_link_member`).
- **Member self-updates are column-limited.** A `BEFORE UPDATE` trigger
  (`enforce_member_self_update`) rejects any change outside
  `email, phone, address, city, avatar_url`, so even a hand-crafted PostgREST
  `PATCH` cannot touch status, role, linkage or identifiers.
- **Role escalation is impossible** for anyone but a `super_admin`
  (`user_roles` is writable only by `is_super_admin()`).
- **Invitations are validated server-side** — the token, the invited email and
  the granted role are all checked in the database; the client only supplies the
  opaque token.
- **The audit trail is redacted and append-only** — it records which fields
  changed for member/family rows (never their values) and never stores
  invitation tokens or passwords.

## Android (Capacitor)

The same React + Vite app runs on Android through **Capacitor 8**. The web
build (`dist/`) *is* the app's UI — Capacitor wraps it in a native shell served
from a secure `https://localhost` origin, so routes, validation, the Supabase
integration and the authorization model are all reused unchanged.

The platform project is committed at [`android/`](android/): it holds the app
id, permissions, icons and signing config that a regenerated folder would lose.

### Native behaviour added

| Concern          | How it works now                                                        |
| ---------------- | ----------------------------------------------------------------------- |
| Keyboard         | Soft keyboard resizes the WebView (`@capacitor/keyboard`), so focused sign-in / profile / member-form fields stay visible |
| Safe areas       | Edge-to-edge layout uses `viewport-fit=cover` + `safe-top`/`safe-bottom` on the header, bottom nav, modals and error screen |
| Loading feedback | Native splash (`@capacitor/splash-screen`) hides once React mounts; screens keep their skeletons and spinners |
| Offline / errors | `@capacitor/network` drives an offline banner; a top-level error boundary replaces blank screens with a recovery action |
| Back button      | Android back walks SPA history and exits from root routes (`@capacitor/app`) |

### Requirements

| Tool           | Version                                    | Notes |
| -------------- | ------------------------------------------ | ----- |
| Node.js        | **22+** (Capacitor 8)                       | Built here with Node 24 |
| JDK            | **21**                                      | Android Studio ships one at `<Studio>\jbr` |
| Android Studio | **Otter 2025.2.1** or newer (Capacitor 8)   | Needed for the IDE / emulator only |
| Android SDK    | Platform **36** + Build-Tools **36.x**      | `compileSdk`/`targetSdk` = 36, `minSdk` = 24 |
| Gradle         | **8.14.3** (via the wrapper)                | No manual install — `android/gradlew` downloads it |

`JAVA_HOME` and `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) must point at the JDK and
SDK. Example for a default Android Studio install (PowerShell):

```powershell
$env:JAVA_HOME        = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME     = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
```

### Build a debug APK

```bash
npm run android:sync   # production web build + copy dist into android/
npm run android:apk    # cap sync, then android/gradlew assembleDebug
```

The APK is written to:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Or drive Gradle directly from `android/`:

```bash
cd android
./gradlew assembleDebug     # macOS / Linux
gradlew.bat assembleDebug   # Windows
```

Install it on a connected device or emulator:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Open the project in Android Studio with `npm run android:open`.

> **Ship against the live backend.** Vite bakes env vars in at *build* time, so
> build with `.env.local` (or `.env.production`) containing
> `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_USE_DEMO_DATA=false`.
> Without them the APK ships in clearly-labelled **demo mode**.

### Security on Android

- Only the **public anon key** is bundled. The service-role key and all
  authorization stay on the backend — RLS and the `SECURITY DEFINER` helpers are
  the single source of truth, exactly as on the web.
- **No member records are cached locally.** Directory, profile and household
  data are fetched from Supabase on every screen. The only `localStorage` writes
  are the demo session (demo mode only) and per-device *field-visibility*
  preferences — never church data. (Supabase Auth separately persists its own
  short-lived session token, as it does on the web.)
- `android:allowBackup="false"` and `android:usesCleartextTraffic="false"` keep
  app data out of adb/cloud backups and block insecure http traffic.

### App icon & splash

The launcher icon and splash screen are generated from the ACA logo
([`public/aca-logo.png`](public/aca-logo.png)) via
[`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets). Source
images live in [`assets/`](assets): `icon.png` (1024×1024) and `splash.png`
(2732×2732). To regenerate every Android density after changing the logo:

```bash
npx @capacitor/assets generate --android \
  --iconBackgroundColor '#0d1626' --iconBackgroundColorDark '#0d1626' \
  --splashBackgroundColor '#0d1626' --splashBackgroundColorDark '#0d1626'
```

The generator produces an adaptive icon (foreground logo + navy background),
legacy/round launcher icons and day/night splash images for all densities.

### Manual steps not done here

- **Release signing** — create an upload keystore and add a `signingConfigs`
  block before shipping a Play Store build.
- **Play Store AAB** — `cd android && gradlew.bat bundleRelease` once signing is
  configured.

## Progressive Web App (installable)

The web build is a **secure, installable PWA** for Windows, macOS, Linux and
Android. It is produced by `npm run build` using
[`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (Workbox `generateSW`),
which emits `manifest.webmanifest`, `sw.js` and the precache runtime.

### What is generated

| Artifact                | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `dist/manifest.webmanifest` | App name, `standalone` display, `start_url`, theme/background `#0d1626`, 192/512 + maskable icons |
| `dist/sw.js`            | Service worker: precaches the **app shell only** and serves the SPA shell for navigations |
| `dist/pwa-*.png`, `dist/apple-touch-icon.png` | Launcher / home-screen icons from the ACA logo |
| `dist/_redirects`       | SPA rewrite for static hosts (Netlify / Cloudflare Pages)      |

### Safe update behaviour

The worker uses `registerType: 'prompt'` — a new version is downloaded and left
**waiting**; the running app is never replaced mid-session. The app shows a
"New version is available → Reload" notice (`PwaUpdatePrompt`) and only swaps in
after the user confirms. Background updates are checked hourly while the app is
open. This keeps a signed-in session stable.

### What the service worker does **not** cache

- **No member records, auth tokens or Supabase data.** Only same-origin static
  build files are precached. Supabase and all other backend requests are **not
  intercepted** — they always go to the network and are never written to a
  public cache.
- The only runtime cache is for **public Google Fonts**. Everything else — the
  signed-in API surface — stays live.
- **No offline access to private data is promised.** Offline, the app *shell*
  opens; records require a connection (the offline banner says so).

### Install

Install requires **HTTPS** in production (or `localhost` for local testing).
`npm run preview` is enough to try it locally.

- **Windows / macOS (Chrome or Edge):** use the **Install app** button in the
  app (header or sign-in screen), or the install icon in the address bar, or
  **Menu → Install ACA Connect** (Edge: **Apps → Install this site as an app**).
  It launches from the Start menu / Applications like a desktop app.
- **Android (Chrome):** **Install app** button, or **menu (⋮) → Install app /
  Add to Home screen**. It opens standalone from the home screen.
- **iPhone / iPad (Safari):** **Share → Add to Home Screen → Add** (Safari has no
  automatic prompt; the app's Install button shows these instructions).

The **Install app** button appears only when the browser can install and the app
is not already installed; otherwise it opens manual instructions.

### Hosting requirements

- Serve over **HTTPS** (service workers require a secure context).
- Configure **SPA fallback** so deep links and refreshes resolve to
  `index.html`. `public/_redirects` covers Netlify / Cloudflare Pages; for
  nginx add `try_files $uri /index.html;`, for Apache a `.htaccess` rewrite (or
  use Vercel's `rewrites`). The service worker's `navigateFallback` also serves
  the shell for in-app navigations once installed.

## Scripts

| Script               | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Vite dev server with HMR                       |
| `npm run build`      | Type-check then production build               |
| `npm run preview`    | Serve the production build                     |
| `npm run lint`       | oxlint                                         |
| `npm run android:sync` | Production web build + `cap sync android`    |
| `npm run android:apk`  | Sync then assemble the Android debug APK     |
| `npm run android:open` | Open the Android project in Android Studio   |
| `npm run cap:sync`     | Plain `cap sync` (all platforms)             |
| `node scripts/rls-bypass-test.mjs` | Live authorization test: proves the two-role model and the attendance/prayer/notification RLS through the public API (needs `.env.test.local`; exits `2` until the new migration is applied) |
