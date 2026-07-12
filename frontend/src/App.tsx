import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import CurrencySprinkle from './components/CurrencySprinkle'
import { AuthProvider } from './features/auth/AuthContext'
import { RedirectIfAuthed, RequireAdmin, RequireAuth, RequireGold, RequireSuperAdmin } from './features/auth/guards'
import LoginPage from './features/auth/LoginPage'
import SignupPage from './features/auth/SignupPage'
import ForgotPasswordPage from './features/auth/ForgotPasswordPage'
import OnboardingPage from './features/auth/OnboardingPage'
import ProfilePage from './features/auth/ProfilePage'
import DashboardPage from './features/dashboard/DashboardPage'
import HistoryPage from './features/history/HistoryPage'
import HistoryChartPage from './features/history/HistoryChartPage'
import GoldPage from './features/gold/GoldPage'
import AdminUserList from './features/admin/AdminUserList'
import AdminUserView from './features/admin/AdminUserView'
import AdminManageAdmins from './features/admin/AdminManageAdmins'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CurrencySprinkle />
        <Routes>
          <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
          <Route path="/signup" element={<RedirectIfAuthed><SignupPage /></RedirectIfAuthed>} />
          <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPasswordPage /></RedirectIfAuthed>} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
          <Route path="/history/chart/:region" element={<RequireAuth><HistoryChartPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/gold" element={<RequireGold><GoldPage /></RequireGold>} />

          <Route path="/admin" element={<RequireAdmin><AdminUserList /></RequireAdmin>} />
          <Route path="/admin/users/:id" element={<RequireAdmin><AdminUserView /></RequireAdmin>} />
          <Route path="/admin/admins" element={<RequireSuperAdmin><AdminManageAdmins /></RequireSuperAdmin>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
