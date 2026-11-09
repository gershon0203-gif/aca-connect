import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import { MemberFieldsProvider } from '@/context/MemberFieldsContext'
import { NetworkProvider } from '@/context/NetworkContext'
import { RequireAuth, RequireRole } from '@/components/auth/guards'
import { AppLayout } from '@/components/layout/AppLayout'
import { AndroidBackButton } from '@/components/system/AndroidBackButton'
import { ErrorBoundary } from '@/components/system/ErrorBoundary'
import { NativeBootstrap } from '@/components/system/NativeBootstrap'
import { OfflineBanner } from '@/components/system/OfflineBanner'
import { PwaUpdatePrompt } from '@/components/system/PwaUpdatePrompt'
import { PushNavigationHandler } from '@/components/system/PushNavigationHandler'
import { registerPushListeners } from '@/services/push'
import LoginPage from '@/pages/Login'
import RegisterPage from '@/pages/Register'
import ForgotPasswordPage from '@/pages/ForgotPassword'
import ResetPasswordPage from '@/pages/ResetPassword'
import AcceptInvitationPage from '@/pages/AcceptInvitation'
import DashboardPage from '@/pages/Dashboard'
import BirthdaysPage from '@/pages/Birthdays'
import AnniversariesPage from '@/pages/Anniversaries'
import ChatPage from '@/pages/Chat'
import EventsPage from '@/pages/Events'
import DailyHubPage from '@/pages/DailyHub'
import MembersPage from '@/pages/Members'
import MemberDetailPage from '@/pages/MemberDetail'
import FamiliesPage from '@/pages/Families'
import FamilyDetailPage from '@/pages/FamilyDetail'
import MinistriesPage from '@/pages/Ministries'
import ReportsPage from '@/pages/Reports'
import MyProfilePage from '@/pages/MyProfile'
import MyFamilyPage from '@/pages/MyFamily'
import MyAttendancePage from '@/pages/MyAttendance'
import AttendancePage from '@/pages/Attendance'
import AttendanceSessionPage from '@/pages/AttendanceSession'
import PrayersPage from '@/pages/Prayers'
import NotificationsPage from '@/pages/Notifications'
import AdminUsersPage from '@/pages/AdminUsers'
import SettingsPage from '@/pages/Settings'
import NotFoundPage from '@/pages/NotFound'

export default function App() {
  // Register push notification listeners once (foreground + tap).
  // Safe on web: the listeners check for native Capacitor APIs.
  useEffect(() => {
    let cleanup: (() => void) | null = null
    registerPushListeners().then((r) => {
      cleanup = r
    })
    return () => cleanup?.()
  }, [])

  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <MemberFieldsProvider>
            <NetworkProvider>
              <OfflineBanner />
              <PwaUpdatePrompt />
              <HashRouter>
                <NativeBootstrap />
                <PushNavigationHandler />
                <AndroidBackButton />
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route
                    path="/accept-invitation"
                    element={<AcceptInvitationPage />}
                  />

                  <Route element={<RequireAuth />}>
                    <Route element={<AppLayout />}>
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/birthdays" element={<BirthdaysPage />} />
                      <Route path="/my-profile" element={<MyProfilePage />} />
                      <Route
                        path="/notifications"
                        element={<NotificationsPage />}
                      />

                      <Route element={<RequireRole roles={['member']} />}>
                        <Route path="/my-family" element={<MyFamilyPage />} />
                        <Route
                          path="/my-attendance"
                          element={<MyAttendancePage />}
                        />
                      </Route>

                      <Route
                        element={
                          <RequireRole roles={['super_admin', 'member']} />
                        }
                      >
                        <Route path="/members" element={<MembersPage />} />
                        <Route path="/families" element={<FamiliesPage />} />
                        <Route
                          path="/families/:code"
                          element={<FamilyDetailPage />}
                        />
                        <Route
                          path="/anniversaries"
                          element={<AnniversariesPage />}
                        />
                        <Route path="/ministries" element={<MinistriesPage />} />
                        <Route path="/reports" element={<ReportsPage />} />
                        <Route path="/attendance" element={<AttendancePage />} />
                        <Route
                          path="/attendance/:id"
                          element={<AttendanceSessionPage />}
                        />
                        <Route path="/prayers" element={<PrayersPage />} />
                        <Route path="/chat" element={<ChatPage />} />
                        <Route path="/events" element={<EventsPage />} />
                        <Route path="/daily-hub" element={<DailyHubPage />} />
                      </Route>
                      <Route
                        element={
                          <RequireRole roles={['super_admin', 'member']} />
                        }
                      >
                        <Route
                          path="/members/:id"
                          element={<MemberDetailPage />}
                        />
                      </Route>

                      <Route element={<RequireRole roles={['super_admin']} />}>
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/admin/users" element={<AdminUsersPage />} />
                      </Route>
                    </Route>
                  </Route>

                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </HashRouter>
            </NetworkProvider>
          </MemberFieldsProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
