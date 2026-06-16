import { Routes, Route } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import HomePage from '@/pages/HomePage'
import WorkspacePage from '@/pages/WorkspacePage'
import SettingsPage from '@/pages/SettingsPage'
import MarkdownStudioPage from '@/features/markdown-studio'
import DiagramStudioPage from '@/features/diagram-studio'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="tools/markdown" element={<MarkdownStudioPage />} />
        <Route path="tools/diagram" element={<DiagramStudioPage />} />
      </Route>
    </Routes>
  )
}
