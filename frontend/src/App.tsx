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
import TransactionsPage from './features/transactions/TransactionsPage'
import DividendsPage from './features/dividends/DividendsPage'
import HistoryChartPage from './features/history/HistoryChartPage'
import GoldPage from './features/gold/GoldPage'
import AdminUserList from './features/admin/AdminUserList'
import AdminUserView from './features/admin/AdminUserView'
import AdminUserTransactions from './features/admin/AdminUserTransactions'
import AdminUserDividends from './features/admin/AdminUserDividends'
import AdminManageAdmins from './features/admin/AdminManageAdmins'
import AdminBranding from './features/admin/AdminBranding'
import { BrandingProvider } from './lib/useBranding'

export default function App() {
  return (
    <BrowserRouter>
      <BrandingProvider>
        <AuthProvider>
          <CurrencySprinkle />
          <Routes>
            <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
            <Route path="/signup" element={<RedirectIfAuthed><SignupPage /></RedirectIfAuthed>} />
            <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPasswordPage /></RedirectIfAuthed>} />
            <Route path="/onboarding" element={<OnboardingPage />} />

            <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
            <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
            <Route path="/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
            <Route path="/dividends" element={<RequireAuth><DividendsPage /></RequireAuth>} />
            <Route path="/history/chart/:region" element={<RequireAuth><HistoryChartPage /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/gold" element={<RequireGold><GoldPage /></RequireGold>} />

            <Route path="/admin" element={<RequireAdmin><AdminUserList /></RequireAdmin>} />
            <Route path="/admin/users/:id" element={<RequireAdmin><AdminUserView /></RequireAdmin>} />
            <Route path="/admin/users/:id/transactions" element={<RequireAdmin><AdminUserTransactions /></RequireAdmin>} />
            <Route path="/admin/users/:id/dividends" element={<RequireAdmin><AdminUserDividends /></RequireAdmin>} />
            <Route path="/admin/admins" element={<RequireSuperAdmin><AdminManageAdmins /></RequireSuperAdmin>} />
            <Route path="/admin/branding" element={<RequireSuperAdmin><AdminBranding /></RequireSuperAdmin>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrandingProvider>
    </BrowserRouter>
  )
}
