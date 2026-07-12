import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './lib/useTheme'
import './index.css'

// Apply the stored theme before first paint so unauthenticated pages
// (login/signup) render in the chosen theme too.
initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
