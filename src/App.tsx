import { Routes, Route } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import HomePage from '@/pages/HomePage'
import WorkspacePage from '@/pages/WorkspacePage'
import SettingsPage from '@/pages/SettingsPage'
import MarkdownStudioPage from '@/features/markdown-studio'
import DiagramStudioPage from '@/features/diagram-studio'
import RagStudioPage from '@/features/rag-studio'
import JsonStudioPage from '@/features/json-studio'
import TokenStudioPage from '@/features/token-studio'
import SvgStudioPage from '@/features/svg-studio'
import CryptoStudioPage from '@/features/crypto-studio'
import ImageStudioPage from '@/features/image-studio'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="tools/markdown" element={<MarkdownStudioPage />} />
        <Route path="tools/diagram" element={<DiagramStudioPage />} />
        <Route path="tools/rag" element={<RagStudioPage />} />
        <Route path="tools/json" element={<JsonStudioPage />} />
        <Route path="tools/tokens" element={<TokenStudioPage />} />
        <Route path="tools/svg" element={<SvgStudioPage />} />
        <Route path="tools/crypto" element={<CryptoStudioPage />} />
        <Route path="tools/image" element={<ImageStudioPage />} />
      </Route>
    </Routes>
  )
}
