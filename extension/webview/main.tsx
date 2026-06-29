import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Tooltip from '@radix-ui/react-tooltip'
import './index.css'
import '@/store/settingsStore' // applies a saved data-theme on import
import PreviewHost from './PreviewHost'
import PanelHost from './PanelHost'

declare global {
  interface Window {
    __DEVHUB__?: {
      view: 'preview' | 'panel'
      tool: string
      colorTheme: 'light' | 'dark'
    }
  }
}

const boot = window.__DEVHUB__ ?? { view: 'preview', tool: 'markdown', colorTheme: 'dark' }

// Track the editor's light/dark theme (overrides whatever settingsStore restored).
document.documentElement.setAttribute('data-theme', boot.colorTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tooltip.Provider delayDuration={30}>
      {boot.view === 'panel' ? (
        <PanelHost tool={boot.tool} />
      ) : (
        <PreviewHost tool={boot.tool} />
      )}
    </Tooltip.Provider>
  </StrictMode>,
)
