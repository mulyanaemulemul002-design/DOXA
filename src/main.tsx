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

function Root() {
  const app = <QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider>
  return reownConfig ? <AppKitProvider {...reownConfig}>{app}</AppKitProvider> : app
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
