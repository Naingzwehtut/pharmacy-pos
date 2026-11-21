import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import { LanguageProvider } from './i18n'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
)
