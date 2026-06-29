import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Tooltip from '@radix-ui/react-tooltip'
import './index.css'
import './store/settingsStore' // apply saved theme on load
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tooltip.Provider delayDuration={30}>
      <BrowserRouter basename={import.meta.env.VITE_BASE_PATH?.replace(/\/$/, '') ?? '/devhub'}>
        <App />
      </BrowserRouter>
    </Tooltip.Provider>
  </StrictMode>,
)
