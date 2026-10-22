import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerOffline } from './platform/offline'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
void registerOffline()
