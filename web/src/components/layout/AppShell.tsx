import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import CommandPalette from './CommandPalette'
import IndexingFooter from './IndexingFooter'

export default function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main className="devhub-main">
          <Outlet />
        </main>
        <IndexingFooter />
      </div>
      <CommandPalette />
    </div>
  )
}
