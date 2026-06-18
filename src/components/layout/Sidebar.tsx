import { NavLink, useMatch } from 'react-router-dom'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Home, FolderOpen, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'
import './Sidebar.css'

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/workspace', label: 'Workspace', icon: FolderOpen, end: false },
]

const bottomItems = [
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed } = useSettingsStore()

  return (
    <Tooltip.Provider delayDuration={150}>
      <aside className={cn(
        'shrink-0 flex flex-col bg-surface-raised border-r border-border transition-[width] duration-200 ease',
        sidebarCollapsed ? 'w-12' : 'w-[13.75rem]'
      )}>
        {/* Logo */}
        <div className={cn(
          'h-11 flex items-center shrink-0 border-b border-border gap-2',
          sidebarCollapsed ? 'px-3 justify-center' : 'px-4 justify-start'
        )}>
          <span className="text-[1.12rem] font-bold tracking-[-0.03rem] text-on-surface leading-none font-sans">
            {sidebarCollapsed ? 'D' : 'DevHub'}
          </span>
        </div>

        {/* Nav */}
        <nav className={cn(
          'flex-1 flex flex-col gap-px',
          sidebarCollapsed ? 'py-2 px-0' : 'p-2'
        )}>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavItem
              key={to}
              to={to}
              label={label}
              icon={<Icon size={18} />}
              collapsed={sidebarCollapsed}
              end={end}
            />
          ))}
        </nav>

        {/* Bottom */}
        <div className={cn(
          'flex flex-col gap-px border-t border-border',
          sidebarCollapsed ? 'py-2 px-0' : 'p-2'
        )}>
          {bottomItems.map(({ to, label, icon: Icon }) => (
            <NavItem
              key={to}
              to={to}
              label={label}
              icon={<Icon size={18} />}
              collapsed={sidebarCollapsed}
            />
          ))}

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              'flex items-center gap-2 bg-transparent border-none cursor-pointer text-on-surface-muted text-xs tracking-[-0.01rem] w-full mt-1 hover:bg-surface-hover transition-colors duration-150',
              sidebarCollapsed
                ? 'justify-center py-[0.44rem] px-0 rounded-none'
                : 'justify-start py-[0.44rem] px-[0.62rem] rounded-lg'
            )}
          >
            {sidebarCollapsed
              ? <ChevronRight size={14} />
              : <><ChevronLeft size={14} /><span>Collapse</span></>}
          </button>
        </div>
      </aside>
    </Tooltip.Provider>
  )
}

interface NavItemProps {
  to: string
  label: string
  icon: React.ReactNode
  collapsed: boolean
  end?: boolean
}

function NavItem({ to, label, icon, collapsed, end }: NavItemProps) {
  const match = useMatch({ path: to, end: end ?? true })
  const isActive = !!match

  const link = (
    <NavLink
      to={to}
      end={end}
      className={cn(
        'sidebar-nav-link flex items-center gap-2 w-full no-underline text-[0.81rem] tracking-[-0.01rem] text-on-surface-muted transition-colors duration-150',
        collapsed
          ? 'justify-center py-2 px-0 rounded-none'
          : 'justify-start py-2 px-[0.62rem] rounded-lg',
        isActive && 'text-accent'
      )}
    >
      <span className="shrink-0 flex justify-center">{icon}</span>
      {!collapsed && <span>{label}</span>}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={10}
          className="bg-surface-raised text-on-surface text-xs font-medium tracking-[-0.01rem] px-[0.62rem] py-[0.31rem] rounded-lg border border-border shadow-[0_0.12rem_0.5rem_rgba(0,0,0,0.12)] z-50"
        >
          {label}
          <Tooltip.Arrow className="fill-border" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
