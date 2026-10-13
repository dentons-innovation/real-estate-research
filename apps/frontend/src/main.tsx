import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import AccessGate from './components/AccessGate'
import { LanguageProvider } from './lib/i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <AccessGate>{(onAuthError) => <App onAuthError={onAuthError} />}</AccessGate>
    </LanguageProvider>
  </StrictMode>,
)
