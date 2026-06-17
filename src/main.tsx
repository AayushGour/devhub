import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './store/settingsStore' // apply saved theme on load
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/devhub">
      <App />
    </BrowserRouter>
  </StrictMode>,
)
