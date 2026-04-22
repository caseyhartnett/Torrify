import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { initializeAnalytics } from './services/analytics'
import { IS_WEB_RUNTIME } from './platform/runtime'
import './index.css'

async function bootstrap(): Promise<void> {
  if (IS_WEB_RUNTIME) {
    const { installWebElectronAPI } = await import('./platform/web/electronAPI')
    installWebElectronAPI()
    await initializeAnalytics()
  }

  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Root element "#root" not found')
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}

void bootstrap()
