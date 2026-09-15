import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppKitProvider } from '@reown/appkit/react'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './styles.css'
import './launch-board.css'
import { initializeReownAppKit, queryClient, reownConfig } from './lib/reown'

initializeReownAppKit()

function MissingReownConfig() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: '#050807', color: '#f2fff9', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <section role="alert" style={{ width: 'min(100%, 32rem)', border: '1px solid #2ee6a0', borderRadius: '0.75rem', padding: '1.5rem', background: '#0b1410', boxShadow: '0 18px 60px rgba(0, 0, 0, 0.35)' }}>
        <p style={{ margin: 0, color: '#2ee6a0', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Configuration error</p>
        <h1 style={{ margin: '0.75rem 0 0.5rem', fontSize: '1.5rem' }}>Wallet connection is unavailable</h1>
        <p style={{ margin: 0, color: '#b7c8c0', lineHeight: 1.6 }}>
          The Reown project ID is missing. Set <code>VITE_REOWN_PROJECT_ID</code> in the deployment environment and rebuild the app.
        </p>
      </section>
    </main>
  )
}

function Root() {
  if (!reownConfig) return <MissingReownConfig />

  const app = <QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider>
  return <AppKitProvider {...reownConfig}>{app}</AppKitProvider>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
