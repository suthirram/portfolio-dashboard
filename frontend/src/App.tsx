import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext'
import { RedirectIfAuthed, RequireAdmin, RequireAuth, RequireSuperAdmin } from './features/auth/guards'
import LoginPage from './features/auth/LoginPage'
import SignupPage from './features/auth/SignupPage'
import ForgotPasswordPage from './features/auth/ForgotPasswordPage'
import OnboardingPage from './features/auth/OnboardingPage'
import ProfilePage from './features/auth/ProfilePage'
import DashboardPage from './features/dashboard/DashboardPage'
import AdminUserList from './features/admin/AdminUserList'
import AdminUserView from './features/admin/AdminUserView'
import AdminManageAdmins from './features/admin/AdminManageAdmins'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
          <Route path="/signup" element={<RedirectIfAuthed><SignupPage /></RedirectIfAuthed>} />
          <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPasswordPage /></RedirectIfAuthed>} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />

          <Route path="/admin" element={<RequireAdmin><AdminUserList /></RequireAdmin>} />
          <Route path="/admin/users/:id" element={<RequireAdmin><AdminUserView /></RequireAdmin>} />
          <Route path="/admin/admins" element={<RequireSuperAdmin><AdminManageAdmins /></RequireSuperAdmin>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
