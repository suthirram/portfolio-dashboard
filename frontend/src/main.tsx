import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initBranding } from './lib/useBranding'
import { initTheme } from './lib/useTheme'
import { initUiMode } from './lib/uiMode'
import './index.css'

// Apply the stored theme and UI mode before first paint so unauthenticated
// pages (login/signup) render in the chosen theme and look too.
initTheme()
initUiMode()
initBranding()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
