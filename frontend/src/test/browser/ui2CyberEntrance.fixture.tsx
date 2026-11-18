import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../../features/auth/AuthContext'
import { ShellLayout } from '../../components/shell/AppShell'
import { initTheme } from '../../lib/useTheme'
import { initUiMode, UiModeSync } from '../../lib/uiMode'
import '../../index.css'

function Page() {
  const [clicks, setClicks] = useState(0)
  return <main><button onClick={() => setClicks(count => count + 1)}>Refresh fixture</button>
    <output aria-label="Refresh count">{clicks}</output><Link to="/history">Fixture History</Link>
  </main>
}

initTheme()
initUiMode()
createRoot(document.getElementById('root')!).render(
  <AuthProvider><UiModeSync /><MemoryRouter>
    <Routes><Route element={<ShellLayout />}><Route path="*" element={<Page />} /></Route></Routes>
  </MemoryRouter></AuthProvider>,
)
