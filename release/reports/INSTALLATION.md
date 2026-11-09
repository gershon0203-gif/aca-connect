# ACA Connect — Installation & Run Instructions

## Web (PWA)
1. Ensure `.env.local` contains `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_USE_DEMO_DATA=false`.
2. `npm install`
3. `npm run build`
4. Serve `dist/` over HTTPS (or `npm run preview` locally).
5. Install from browser (Chrome/Edge: Install app button).

## Android
1. Set `JAVA_HOME` to JDK 21 and `ANDROID_HOME` to Android SDK.
2. `npm run android:sync`
3. `cd android && gradlew.bat assembleRelease`
4. APK: `android/app/build/outputs/apk/release/app-release-unsigned.apk` (or debug).
5. Install: `adb install -r <apk>`. Package ID `org.acapozhichalur.connect`.

## Windows Desktop
1. `npm run electron:build`
2. Installer: `release/ACA Connect Setup <version>.exe`
3. Run installer; desktop shortcut created.

## Supabase
- Apply migrations in `supabase/migrations/` in order (including new chat/events/daily hub migration).
- Deploy Edge Functions: `supabase functions deploy send-push-notification`, `send-invitation`.
- Set secrets: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `APP_URL`.
- Dashboard: disable email confirmation for no-confirmation registration; redirect URLs.
"