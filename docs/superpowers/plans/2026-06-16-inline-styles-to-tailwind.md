# Inline Styles → Tailwind CSS Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all `style={{}}` inline props and JS style mutations from 9 source files, replacing them with Tailwind utility classes; create companion `.css` files only where Tailwind cannot express the rule.

**Architecture:** Pure Tailwind v4 utilities (already configured with `@theme inline` CSS-var mappings: `bg-surface`, `text-on-surface-muted`, `border-border`, `bg-accent`, etc.). Conditional classes use the existing `cn()` helper from `@/lib/utils`. JS `onMouseEnter/Leave` style mutations become `hover:` classes. `onMouseDown/Up` scale effects become `active:scale-95`. Runtime-dynamic values (SettingsPage hardcoded swatch hex colors from the `themes` data array) are the **only** permitted remaining inline `style={}`. Two companion CSS files are created: `Sidebar.css` (`:not([aria-current])` hover selector) and no others — all other hover patterns are expressible with `hover:` variants.

**Tech Stack:** React 18, Tailwind CSS v4 (`@tailwindcss/vite`), `clsx` via `cn()` at `@/lib/utils`, react-router-dom `NavLink` with `className` function API, Radix UI components.

---

## File Map

| File | Action | New companion file |
|------|--------|--------------------|
| `src/components/layout/Topbar.tsx` | Modify | — |
| `src/components/layout/Sidebar.tsx` | Modify | `src/components/layout/Sidebar.css` (create) |
| `src/features/markdown-studio/components/Toolbar.tsx` | Modify | — |
| `src/features/markdown-studio/index.tsx` | Modify | — |
| `src/features/markdown-studio/components/PreviewPane.tsx` | Modify | — |
| `src/pages/HomePage.tsx` | Modify | — |
| `src/pages/SettingsPage.tsx` | Modify | — (2 inline styles remain for runtime swatch colors) |
| `src/features/markdown-studio/components/StylePanel.tsx` | Modify | — |
| `src/features/markdown-studio/components/ExportModal.tsx` | Modify | — |

---

## Tailwind Class Reference (used throughout)

| Old inline value | Tailwind class |
|-----------------|----------------|
| `height: 44` | `h-11` |
| `width: 30 / height: 30` | `w-[30px] h-[30px]` |
| `width: 260` | `w-[260px]` |
| `width: 220` (sidebar expanded) | `w-[220px]` |
| `width: 48` (sidebar collapsed) | `w-12` |
| `borderRadius: 9999` | `rounded-full` |
| `borderRadius: 18` | `rounded-[18px]` |
| `borderRadius: 11` | `rounded-[11px]` |
| `borderRadius: 8` | `rounded-lg` |
| `borderRadius: 7` | `rounded-[7px]` |
| `borderRadius: 6` | `rounded-md` |
| `borderRadius: 5` | `rounded-[5px]` |
| `gap: 4` | `gap-1` |
| `gap: 8` | `gap-2` |
| `gap: 10` | `gap-[10px]` |
| `gap: 12` | `gap-3` |
| `gap: 16` | `gap-4` |
| `gap: 20` | `gap-5` |
| `padding: 24` | `p-6` |
| `padding: '0 20px'` | `px-5` |
| `padding: '6px 14px'` | `px-[14px] py-1.5` |
| `padding: '5px 10px'` | `px-[10px] py-[5px]` |
| `padding: '4px 10px'` | `px-[10px] py-1` |
| `padding: '1px 5px'` | `px-[5px] py-px` |
| `padding: '2px 8px'` | `px-2 py-0.5` |
| `padding: 10` | `p-[10px]` |
| `fontSize: 40` | `text-[40px]` |
| `fontSize: 17` | `text-[17px]` |
| `fontSize: 15` | `text-[15px]` |
| `fontSize: 13` | `text-[13px]` |
| `fontSize: 12` | `text-xs` |
| `fontSize: 11` | `text-[11px]` |
| `fontSize: 10` | `text-[10px]` |
| `fontWeight: 700` | `font-bold` |
| `fontWeight: 600` | `font-semibold` |
| `fontWeight: 500` | `font-medium` |
| `fontWeight: 400` | `font-normal` |
| `letterSpacing: '-0.5px'` | `tracking-[-0.5px]` |
| `letterSpacing: '-0.374px'` | `tracking-[-0.374px]` |
| `letterSpacing: '-0.2px'` | `tracking-[-0.2px]` |
| `letterSpacing: '-0.12px'` | `tracking-[-0.12px]` |
| `letterSpacing: '-0.15px'` | `tracking-[-0.15px]` |
| `letterSpacing: '-0.1px'` | `tracking-[-0.1px]` |
| `letterSpacing: '0.04em'` | `tracking-[0.04em]` |
| `letterSpacing: '0.06em'` | `tracking-[0.06em]` |
| `letterSpacing: '0.08em'` | `tracking-[0.08em]` |
| `transition: 'border-color 0.15s'` | `transition-colors duration-150` |
| `transition: 'all 0.15s'` | `transition-all duration-150` |
| `transition: 'width 0.2s ease'` | `transition-[width] duration-200 ease` |
| `opacity: 0.6` | `opacity-60` |
| `margin: '-2rem -2.5rem'` | `-my-8 -mx-10` |
| `gridTemplateColumns: 'repeat(3, 1fr)'` | `grid-cols-3` |
| `gridTemplateColumns: '1fr 1fr'` | `grid-cols-2` |
| `gridColumn: '1 / -1'` | `col-span-full` |
| `boxShadow: '0 1px 4px rgba(0,0,0,0.12)'` | `shadow-[0_1px_4px_rgba(0,0,0,0.12)]` |
| `boxShadow: '0 2px 16px rgba(0,0,0,0.08)'` | `shadow-[0_2px_16px_rgba(0,0,0,0.08)]` |
| `boxShadow: '0 24px 64px rgba(0,0,0,0.3)'` | `shadow-[0_24px_64px_rgba(0,0,0,0.3)]` |
| `boxShadow: '0 2px 8px rgba(0,0,0,0.12)'` | `shadow-[0_2px_8px_rgba(0,0,0,0.12)]` |
| `backgroundColor: 'var(--surface)'` | `bg-surface` |
| `backgroundColor: 'var(--surface-raised)'` | `bg-surface-raised` |
| `color: 'var(--on-surface)'` | `text-on-surface` |
| `color: 'var(--on-surface-muted)'` | `text-on-surface-muted` |
| `color: 'var(--accent)'` | `text-accent` |
| `color: 'var(--accent-text)'` | `text-accent-text` |
| `border: '1px solid var(--border)'` | `border border-border` |
| `borderBottom: '1px solid var(--border)'` | `border-b border-border` |
| `backgroundColor: 'var(--accent)'` | `bg-accent` |
| `onMouseEnter → color: on-surface` | `hover:text-on-surface` |
| `onMouseEnter → borderColor: accent` | `hover:border-accent` |
| `onMouseEnter → bg: surface-hover` | `hover:bg-surface-hover` |
| `onMouseDown → scale(0.95)` | `active:scale-95` |
| `onFocus → borderColor: accent` | `focus:border-accent` |
| `fontFamily: 'inherit'` | `font-[inherit]` |
| `outline: 'none'` | `outline-none` |

---

## Task 1: Topbar.tsx

**Files:**
- Modify: `src/components/layout/Topbar.tsx`

- [ ] **Step 1: Replace file content**

```tsx
import { Search, Sun, Moon } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import type { Theme } from '@/types'

const themes: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'github', label: 'GitHub' },
  { value: 'nord', label: 'Nord' },
  { value: 'dracula', label: 'Dracula' },
]

export default function Topbar() {
  const { theme, setTheme } = useSettingsStore()
  const { setCommandPaletteOpen } = useUIStore()
  const isDark = theme !== 'light'

  return (
    <header className="h-11 flex items-center px-5 gap-3 shrink-0 bg-surface border-b border-border">
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="topbar-search flex items-center gap-2 w-[260px] px-[14px] py-1.5 rounded-full border border-border bg-surface-raised text-on-surface-muted text-[13px] tracking-[-0.12px] cursor-text shrink-0 text-left hover:border-accent transition-colors duration-150"
      >
        <Search size={13} className="shrink-0" />
        <span className="flex-1">Search</span>
        <kbd className="text-[11px] text-on-surface-muted border border-border rounded-[5px] px-[5px] py-px bg-surface tracking-normal">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      <select
        value={theme}
        onChange={e => setTheme(e.target.value as Theme)}
        className="text-xs font-normal tracking-[-0.12px] bg-surface-raised text-on-surface border border-border rounded-full px-[10px] py-1 cursor-pointer outline-none font-[inherit]"
      >
        {themes.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      <button
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label="Toggle theme"
        className="flex items-center justify-center w-[30px] h-[30px] rounded-full border border-border bg-surface-raised text-on-surface-muted cursor-pointer hover:text-on-surface hover:border-accent transition-colors duration-150"
      >
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </header>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd devhub && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Topbar.tsx
git commit -m "style: migrate Topbar inline styles to Tailwind"
```

---

## Task 2: Sidebar.tsx + Sidebar.css

**Files:**
- Create: `src/components/layout/Sidebar.css`
- Modify: `src/components/layout/Sidebar.tsx`

The NavLink component from react-router renders `aria-current="page"` on the active link. The hover suppression for active links (don't change background when link is active) cannot be expressed as a simple Tailwind `hover:` class — it requires `:not([aria-current="page"]):hover`. This goes in `Sidebar.css`.

- [ ] **Step 1: Create Sidebar.css**

```css
/* Hover only applies when the link is NOT the active route */
.sidebar-nav-link:not([aria-current="page"]):hover {
  background-color: var(--surface-hover);
  color: var(--on-surface);
}
```

- [ ] **Step 2: Replace Sidebar.tsx**

```tsx
import { NavLink } from 'react-router-dom'
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
        sidebarCollapsed ? 'w-12' : 'w-[220px]'
      )}>
        {/* Logo */}
        <div className={cn(
          'h-11 flex items-center shrink-0 border-b border-border gap-2',
          sidebarCollapsed ? 'px-3 justify-center' : 'px-4 justify-start'
        )}>
          <span className="text-[18px] font-bold tracking-[-0.5px] text-on-surface leading-none font-sans">
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
              'flex items-center gap-2 bg-transparent border-none cursor-pointer text-on-surface-muted text-xs tracking-[-0.12px] w-full mt-1 hover:bg-surface-hover transition-colors duration-150',
              sidebarCollapsed
                ? 'justify-center py-[7px] px-0 rounded-none'
                : 'justify-start py-[7px] px-[10px] rounded-lg'
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
  const link = (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        'sidebar-nav-link flex items-center gap-2 w-full no-underline text-[13px] tracking-[-0.2px] text-on-surface-muted transition-colors duration-150',
        collapsed
          ? 'justify-center py-2 px-0 rounded-none'
          : 'justify-start py-2 px-[10px] rounded-lg',
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
          className="bg-surface-raised text-on-surface text-xs font-medium tracking-[-0.12px] px-[10px] py-[5px] rounded-lg border border-border shadow-[0_2px_8px_rgba(0,0,0,0.12)] z-50"
        >
          {label}
          <Tooltip.Arrow className="fill-border" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.css
git commit -m "style: migrate Sidebar inline styles to Tailwind + Sidebar.css hover rule"
```

---

## Task 3: Toolbar.tsx (Markdown Studio)

**Files:**
- Modify: `src/features/markdown-studio/components/Toolbar.tsx`

Key patterns: `active:scale-95` replaces `onMouseDown/Up` transform mutations. `focus:border-b-accent` replaces `onFocus/Blur` border mutations on the title input.

- [ ] **Step 1: Replace file content**

```tsx
import { FileDown, FileText, Sliders } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolbarProps {
  title: string
  onTitleChange: (t: string) => void
  onExportPDF: () => void
  onExportHTML: () => void
  onExportMarkdown: () => void
  stylesOpen: boolean
  onToggleStyles: () => void
}

export default function Toolbar({
  title, onTitleChange,
  onExportPDF, onExportHTML, onExportMarkdown,
  stylesOpen, onToggleStyles,
}: ToolbarProps) {
  return (
    <div className="h-11 flex items-center px-4 gap-[10px] shrink-0 border-b border-border bg-surface">
      <input
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        placeholder="Untitled"
        className="toolbar-title bg-transparent border-0 border-b border-b-transparent outline-none text-on-surface text-[13px] font-semibold tracking-[-0.2px] font-[inherit] w-[180px] px-1 py-0.5 focus:border-b-accent transition-colors duration-150"
      />

      <div className="flex-1" />

      <button
        onClick={onToggleStyles}
        title="Toggle style panel"
        className={cn(
          'flex items-center gap-[5px] px-[10px] py-[5px] rounded-[7px] border text-xs cursor-pointer font-[inherit] transition-all duration-150',
          stylesOpen
            ? 'border-accent bg-accent text-accent-text'
            : 'border-border bg-transparent text-on-surface-muted'
        )}
      >
        <Sliders size={13} />
        Styles
      </button>

      <div className="w-px h-5 bg-border" />

      <button
        onClick={onExportPDF}
        className="flex items-center gap-[5px] px-[14px] py-1.5 rounded-full bg-accent text-accent-text border-none text-xs font-medium cursor-pointer font-[inherit] tracking-[-0.15px] hover:bg-accent-hover active:scale-95 transition-[background-color,transform] duration-150"
      >
        <FileDown size={13} /> PDF
      </button>

      <button
        onClick={onExportHTML}
        className="flex items-center gap-[5px] px-[14px] py-1.5 rounded-full bg-transparent text-accent border border-accent text-xs font-normal cursor-pointer font-[inherit] tracking-[-0.15px] active:scale-95 transition-transform duration-150"
      >
        <FileText size={13} /> HTML
      </button>

      <button
        onClick={onExportMarkdown}
        title="Download .md"
        className="flex items-center justify-center w-[30px] h-[30px] rounded-[7px] border border-border bg-transparent text-on-surface-muted cursor-pointer text-[10px] font-semibold font-[inherit] hover:text-on-surface transition-colors duration-150"
      >
        .md
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/features/markdown-studio/components/Toolbar.tsx
git commit -m "style: migrate Toolbar inline styles to Tailwind"
```

---

## Task 4: markdown-studio/index.tsx

**Files:**
- Modify: `src/features/markdown-studio/index.tsx`

- [ ] **Step 1: Replace file content**

```tsx
import { useRef, useState, useCallback } from 'react'
import Toolbar from './components/Toolbar'
import EditorPane from './components/EditorPane'
import PreviewPane from './components/PreviewPane'
import StylePanel from './components/StylePanel'
import { useMarkdownEditor } from './hooks/useMarkdownEditor'
import { exportToPDF, exportToHTML, exportToMarkdown, defaultExportConfig } from './utils/pdfExport'
import { createDefaultSettings, createDefaultRule, type StyleSettings, type ElementRule } from './utils/styleBuilder'

export default function MarkdownStudioPage() {
  const { content, title, setTitle, updateContent } = useMarkdownEditor()
  const previewRef = useRef<HTMLDivElement>(null)

  const [themeId, setThemeId] = useState('classic')
  const [styleSettings, setStyleSettings] = useState<StyleSettings>(createDefaultSettings)
  const [stylesOpen, setStylesOpen] = useState(false)

  const setDoc = useCallback((key: string, val: string) =>
    setStyleSettings(s => ({ ...s, document: { ...s.document, [key]: val } })), [])

  const setRule = useCallback((i: number, patch: Partial<ElementRule>) =>
    setStyleSettings(s => {
      const rules = [...s.rules]; rules[i] = { ...rules[i], ...patch }; return { ...s, rules }
    }), [])

  const addRule = useCallback(() =>
    setStyleSettings(s => ({ ...s, rules: [...s.rules, createDefaultRule()] })), [])

  const removeRule = useCallback((i: number) =>
    setStyleSettings(s => ({ ...s, rules: s.rules.filter((_, j) => j !== i) })), [])

  const resetStyles = useCallback(() => setStyleSettings(createDefaultSettings()), [])

  const buildConfig = () => ({
    ...defaultExportConfig(title),
    themeId,
    styleSettings,
  })

  return (
    <div className="-my-8 -mx-10 flex flex-col h-full">
      <Toolbar
        title={title}
        onTitleChange={setTitle}
        stylesOpen={stylesOpen}
        onToggleStyles={() => setStylesOpen(o => !o)}
        onExportPDF={() => previewRef.current && exportToPDF(previewRef.current, buildConfig())}
        onExportHTML={() => previewRef.current && exportToHTML(previewRef.current, buildConfig())}
        onExportMarkdown={() => exportToMarkdown(content, title)}
      />

      <div className="flex flex-1 min-h-0">
        <EditorPane value={content} onChange={updateContent} />
        <PreviewPane
          content={content}
          themeId={themeId}
          styleSettings={styleSettings}
          previewRef={previewRef}
        />
        {stylesOpen && (
          <StylePanel
            themeId={themeId}
            styleSettings={styleSettings}
            onThemeChange={setThemeId}
            onDocChange={setDoc}
            onRuleChange={setRule}
            onAddRule={addRule}
            onRemoveRule={removeRule}
            onResetStyles={resetStyles}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/features/markdown-studio/index.tsx
git commit -m "style: migrate MarkdownStudioPage inline styles to Tailwind"
```

---

## Task 5: PreviewPane.tsx

**Files:**
- Modify: `src/features/markdown-studio/components/PreviewPane.tsx`

- [ ] **Step 1: Replace the return statement in PreviewPane**

Only the JSX return block changes. Replace lines 65-70:

```tsx
  return (
    <div className="flex-1 min-w-0 overflow-auto py-6 px-8 border-l border-border bg-surface">
      {/* previewRef = inner content div — export reads innerHTML directly into .md-content wrapper */}
      <div
        ref={(el) => { innerRef.current = el; (previewRef as React.MutableRefObject<HTMLDivElement | null>).current = el }}
        className="markdown-preview rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.12)] min-h-full"
      />
    </div>
  )
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/features/markdown-studio/components/PreviewPane.tsx
git commit -m "style: migrate PreviewPane inline styles to Tailwind"
```

---

## Task 6: HomePage.tsx

**Files:**
- Modify: `src/pages/HomePage.tsx`

Key pattern: `StudioCard` hover (border + shadow) uses conditional Tailwind `hover:` classes applied only when `isAvailable` is true, via `cn()`. No JS event handlers needed.

- [ ] **Step 1: Replace file content**

```tsx
import {
  FileText, GitGraph, Braces, Globe, Database,
  KeyRound, Wrench, FolderOpen, Sparkles,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface Studio {
  id: string
  title: string
  description: string
  icon: ReactNode
  status: 'available' | 'coming-soon'
  phase: string
  href?: string
}

const studios: Studio[] = [
  {
    id: 'markdown',
    title: 'Markdown Studio',
    description: 'Live editor with syntax highlighting, Mermaid diagrams, callouts, and TOC generation.',
    icon: <FileText size={20} />,
    status: 'available',
    phase: 'Phase 1',
    href: '/tools/markdown',
  },
  {
    id: 'diagram',
    title: 'Diagram Studio',
    description: 'Mermaid editor with live preview, templates, and SVG/PNG export.',
    icon: <GitGraph size={20} />,
    status: 'coming-soon',
    phase: 'Phase 3',
  },
  {
    id: 'json',
    title: 'JSON Studio',
    description: 'Format, validate, diff, query with JSONPath, and generate TypeScript types.',
    icon: <Braces size={20} />,
    status: 'coming-soon',
    phase: 'Phase 4',
  },
  {
    id: 'api',
    title: 'API Studio',
    description: 'OpenAPI viewer, request explorer, curl generator, and SDK snippets.',
    icon: <Globe size={20} />,
    status: 'coming-soon',
    phase: 'Phase 5',
  },
  {
    id: 'database',
    title: 'Database Studio',
    description: 'SQL formatter, schema parser, and visual ERD generator.',
    icon: <Database size={20} />,
    status: 'coming-soon',
    phase: 'Phase 6',
  },
  {
    id: 'auth',
    title: 'Auth Studio',
    description: 'JWT decoder and generator, OAuth flow visualizer, Base64 tools.',
    icon: <KeyRound size={20} />,
    status: 'coming-soon',
    phase: 'Phase 7',
  },
  {
    id: 'utilities',
    title: 'Dev Utilities',
    description: 'UUID, hash, password, timestamp, regex playground, cron builder, color tools.',
    icon: <Wrench size={20} />,
    status: 'coming-soon',
    phase: 'Phase 8',
  },
  {
    id: 'workspace',
    title: 'Workspace',
    description: 'Organize markdown, JSON, diagrams, and SQL files into persistent projects.',
    icon: <FolderOpen size={20} />,
    status: 'coming-soon',
    phase: 'Phase 9',
  },
  {
    id: 'ai',
    title: 'AI Studio',
    description: 'AI-assisted documentation, diagram generation, and code explanation.',
    icon: <Sparkles size={20} />,
    status: 'coming-soon',
    phase: 'Phase 13',
  },
]

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-[960px] mx-auto">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="font-sans text-[40px] font-semibold leading-[1.1] tracking-[-0.5px] text-on-surface mb-3">
          Developer Workspace
        </h1>
        <p className="text-[17px] font-normal leading-[1.47] tracking-[-0.374px] text-on-surface-muted max-w-[480px]">
          Docs, diagrams, APIs, and utilities — all in one browser-based tool. No backend, no signup.
        </p>
      </div>

      {/* Section label */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-on-surface-muted">
          Studios
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-4">
        {studios.map(studio => (
          <StudioCard
            key={studio.id}
            studio={studio}
            onClick={studio.href ? () => navigate(studio.href!) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

function StudioCard({ studio, onClick }: { studio: Studio; onClick?: () => void }) {
  const isAvailable = studio.status === 'available'

  return (
    <div
      onClick={onClick}
      className={cn(
        'studio-card bg-surface border border-border rounded-[18px] p-6 flex flex-col gap-4 transition-[border-color,box-shadow] duration-150',
        isAvailable
          ? 'cursor-pointer hover:border-accent hover:shadow-[0_2px_16px_rgba(0,0,0,0.08)]'
          : 'cursor-default opacity-60'
      )}
    >
      {/* Icon + phase badge */}
      <div className="flex items-start justify-between">
        <div className="text-accent">{studio.icon}</div>
        <span className="text-[11px] font-medium tracking-[-0.12px] text-on-surface-muted bg-surface-raised border border-border rounded-full px-2 py-0.5">
          {isAvailable ? 'Available' : studio.phase}
        </span>
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-semibold leading-[1.24] tracking-[-0.374px] text-on-surface">
          {studio.title}
        </h3>
        <p className="text-[13px] font-normal leading-[1.43] tracking-[-0.2px] text-on-surface-muted">
          {studio.description}
        </p>
      </div>

      {/* CTA */}
      {isAvailable && (
        <div className="mt-auto">
          <span className="text-[13px] font-normal text-accent tracking-[-0.2px]">
            Open →
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/HomePage.tsx
git commit -m "style: migrate HomePage inline styles to Tailwind"
```

---

## Task 7: SettingsPage.tsx

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

**Note:** Two `style={}` props intentionally remain inline: `style={{ backgroundColor: t.surface }}` on the swatch preview div and `style={{ backgroundColor: t.accent }}` on the accent dot. These values come from the `themes` data array (hardcoded hex strings like `#0d1117`, `#58a6ff`) and cannot be expressed as Tailwind utility classes.

- [ ] **Step 1: Replace file content**

```tsx
import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'
import type { Theme } from '@/types'

const themes: { value: Theme; label: string; surface: string; accent: string }[] = [
  { value: 'light', label: 'Light', surface: '#ffffff', accent: '#0066cc' },
  { value: 'dark', label: 'Dark', surface: '#1d1d1f', accent: '#2997ff' },
  { value: 'github', label: 'GitHub', surface: '#0d1117', accent: '#58a6ff' },
  { value: 'nord', label: 'Nord', surface: '#2e3440', accent: '#88c0d0' },
  { value: 'dracula', label: 'Dracula', surface: '#282a36', accent: '#bd93f9' },
]

export default function SettingsPage() {
  const { theme, setTheme } = useSettingsStore()

  return (
    <div className="max-w-[680px] mx-auto">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="font-sans text-[40px] font-semibold leading-[1.1] tracking-[-0.5px] text-on-surface mb-2">
          Settings
        </h1>
        <p className="text-[17px] text-on-surface-muted tracking-[-0.374px] leading-[1.47]">
          Customize your DevHub experience.
        </p>
      </div>

      {/* Theme section */}
      <section className="bg-surface border border-border rounded-[18px] p-6">
        <h2 className="text-[17px] font-semibold tracking-[-0.374px] text-on-surface mb-5">
          Appearance
        </h2>

        <div className="flex gap-3 flex-wrap">
          {themes.map(t => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                'flex flex-col items-center gap-2 p-[10px] rounded-[11px] border-2 bg-transparent cursor-pointer transition-colors duration-150 w-24 font-[inherit]',
                theme === t.value
                  ? 'border-accent'
                  : 'border-border hover:border-on-surface-muted'
              )}
            >
              {/* Preview swatch — colors come from data array, must stay inline */}
              <div
                className="w-full h-12 rounded-lg border border-black/[0.08] relative overflow-hidden"
                style={{ backgroundColor: t.surface }}
              >
                <div
                  className="absolute bottom-2 right-2 w-3 h-3 rounded-full"
                  style={{ backgroundColor: t.accent }}
                />
              </div>
              <span className={cn(
                'text-xs tracking-[-0.12px] text-on-surface',
                theme === t.value ? 'font-semibold' : 'font-normal'
              )}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "style: migrate SettingsPage inline styles to Tailwind (swatch colors stay inline)"
```

---

## Task 8: StylePanel.tsx

**Files:**
- Modify: `src/features/markdown-studio/components/StylePanel.tsx`

Key pattern: `panelSelect` constant (a `React.CSSProperties` object used on `<select>` elements) becomes a Tailwind class string constant `PANEL_SELECT_CLS`. `PanelField` label and `PanelInput` component use `focus:border-accent` to replace `onFocus/Blur` handlers.

- [ ] **Step 1: Replace file content**

```tsx
import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { THEMES, THEME_ACCENT } from '../utils/themes'
import {
  COMMON_SELECTORS, FONT_OPTIONS, BORDER_STYLE_OPTIONS,
  createDefaultRule,
  type StyleSettings, type ElementRule,
} from '../utils/styleBuilder'
import { cn } from '@/lib/utils'

const PANEL_SELECT_CLS = 'w-full bg-surface-raised border border-border rounded-md px-2 py-[5px] text-[11px] text-on-surface outline-none font-[inherit] cursor-pointer'

interface StylePanelProps {
  themeId: string
  styleSettings: StyleSettings
  onThemeChange: (id: string) => void
  onDocChange: (key: string, val: string) => void
  onRuleChange: (i: number, patch: Partial<ElementRule>) => void
  onAddRule: () => void
  onRemoveRule: (i: number) => void
  onResetStyles: () => void
}

export default function StylePanel({
  themeId, styleSettings,
  onThemeChange, onDocChange,
  onRuleChange, onAddRule, onRemoveRule, onResetStyles,
}: StylePanelProps) {
  const [section, setSection] = useState<'preset' | 'document' | 'elements'>('preset')

  return (
    <aside className="w-[280px] shrink-0 flex flex-col border-l border-border bg-surface overflow-hidden">
      {/* Section tabs */}
      <div className="flex border-b border-border shrink-0">
        {(['preset', 'document', 'elements'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={cn(
              'flex-1 py-[9px] px-1 border-none bg-transparent cursor-pointer font-[inherit] text-[11px] uppercase tracking-[0.02em] transition-colors duration-150 -mb-px border-b-2',
              section === s
                ? 'text-accent border-b-accent font-semibold'
                : 'text-on-surface-muted border-b-transparent font-normal'
            )}
          >
            {s === 'preset' ? 'Preset' : s === 'document' ? 'Doc' : 'Elements'}
          </button>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-[14px]">
        {section === 'preset' && (
          <PresetSection themeId={themeId} onThemeChange={onThemeChange} />
        )}
        {section === 'document' && (
          <DocumentSection doc={styleSettings.document} onChange={onDocChange} onReset={onResetStyles} />
        )}
        {section === 'elements' && (
          <ElementsSection
            rules={styleSettings.rules}
            onRuleChange={onRuleChange}
            onAddRule={onAddRule}
            onRemoveRule={onRemoveRule}
          />
        )}
      </div>
    </aside>
  )
}

// ── Preset ───────────────────────────────────────────

function PresetSection({ themeId, onThemeChange }: { themeId: string; onThemeChange: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {THEMES.map(t => {
        const active = themeId === t.id
        return (
          <button
            key={t.id}
            onClick={() => onThemeChange(t.id)}
            className={cn(
              'flex items-center gap-3 px-[10px] py-2 rounded-[10px] border cursor-pointer font-[inherit] text-left w-full transition-[border-color,background-color] duration-150',
              active ? 'border-accent bg-surface-raised' : 'border-border bg-transparent'
            )}
          >
            {/* Mini color swatch */}
            <div className="w-9 h-7 rounded-[5px] bg-white border border-black/[0.08] shrink-0 relative overflow-hidden">
              <div className="absolute top-[5px] left-[5px] right-[5px]">
                <div className="h-[3px] rounded-sm mb-0.5" style={{ backgroundColor: t.colors.h1, width: '80%' }} />
                <div className="h-0.5 rounded-sm mb-0.5" style={{ backgroundColor: t.colors.h2, width: '60%' }} />
                <div className="h-0.5 rounded-sm" style={{ backgroundColor: t.colors.h3, width: '45%' }} />
              </div>
              {t.colors.blockquoteBorder && (
                <div className="absolute left-0 top-0 bottom-0 w-[2.5px]" style={{ backgroundColor: THEME_ACCENT[t.id] }} />
              )}
            </div>
            <div>
              <div className={cn('text-xs text-on-surface tracking-[-0.15px]', active ? 'font-semibold' : 'font-medium')}>
                {t.label}
              </div>
              <div className="text-[10px] text-on-surface-muted mt-px">
                {t.fontBody.split(',')[0].replace(/"/g, '')}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Document settings ────────────────────────────────

function DocumentSection({ doc, onChange, onReset }: {
  doc: StyleSettings['document']
  onChange: (k: string, v: string) => void
  onReset: () => void
}) {
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex justify-end">
        <button onClick={onReset} className="text-[11px] text-accent bg-transparent border-none cursor-pointer font-[inherit]">
          Reset
        </button>
      </div>

      <PanelField label="Font">
        <select value={doc.fontFamily} onChange={e => onChange('fontFamily', e.target.value)} className={PANEL_SELECT_CLS}>
          {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </PanelField>

      <div className="grid grid-cols-2 gap-2">
        <PanelField label="Text color">
          <PanelInput value={doc.color} onChange={v => onChange('color', v)} placeholder="#111" />
        </PanelField>
        <PanelField label="Background">
          <PanelInput value={doc.backgroundColor} onChange={v => onChange('backgroundColor', v)} placeholder="#fff" />
        </PanelField>
        <PanelField label="Border width">
          <PanelInput value={doc.borderWidth} onChange={v => onChange('borderWidth', v)} placeholder="1px" />
        </PanelField>
        <PanelField label="Border style">
          <select value={doc.borderStyle} onChange={e => onChange('borderStyle', e.target.value)} className={PANEL_SELECT_CLS}>
            {BORDER_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </PanelField>
        <PanelField label="Border color">
          <PanelInput value={doc.borderColor} onChange={v => onChange('borderColor', v)} placeholder="#e0e0e0" />
        </PanelField>
        <PanelField label="Radius">
          <PanelInput value={doc.borderRadius} onChange={v => onChange('borderRadius', v)} placeholder="0" />
        </PanelField>
      </div>

      <PanelField label="Padding">
        <PanelInput value={doc.padding} onChange={v => onChange('padding', v)} placeholder="22px 18px" />
      </PanelField>
    </div>
  )
}

// ── Element rules ────────────────────────────────────

function ElementsSection({ rules, onRuleChange, onAddRule, onRemoveRule }: {
  rules: ElementRule[]
  onRuleChange: (i: number, p: Partial<ElementRule>) => void
  onAddRule: () => void
  onRemoveRule: (i: number) => void
}) {
  return (
    <div className="flex flex-col gap-[10px]">
      <button
        onClick={onAddRule}
        className="flex items-center justify-center gap-[6px] py-[7px] px-3 rounded-lg border border-dashed border-border bg-transparent text-on-surface-muted text-xs cursor-pointer font-[inherit] w-full hover:border-accent hover:text-accent transition-colors duration-150"
      >
        <Plus size={13} /> Add Element Rule
      </button>

      {rules.length === 0 && (
        <p className="text-[11px] text-on-surface-muted text-center py-3">
          No rules. Add one to override styles per element.
        </p>
      )}

      {rules.map((rule, i) => (
        <RuleCard key={i} rule={rule} index={i} onChange={onRuleChange} onRemove={onRemoveRule} />
      ))}
    </div>
  )
}

function RuleCard({ rule, index, onChange, onRemove }: {
  rule: ElementRule; index: number
  onChange: (i: number, p: Partial<ElementRule>) => void
  onRemove: (i: number) => void
}) {
  const [open, setOpen] = useState(true)
  const set = (patch: Partial<ElementRule>) => onChange(index, patch)

  return (
    <div className="border border-border rounded-[10px] overflow-hidden">
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-[6px] px-[10px] py-2 bg-surface-raised cursor-pointer"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-[0.04em]">
          Rule {index + 1}
        </span>
        <span className="text-[11px] text-accent font-mono flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {rule.selector || 'no selector'}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onRemove(index) }}
          className="text-on-surface-muted bg-transparent border-none cursor-pointer flex p-0.5"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {open && (
        <div className="p-[10px] flex flex-col gap-2">
          {/* Selector */}
          <div className="flex gap-[6px]">
            <div className="flex-1">
              <PanelField label="Quick select">
                <select className={PANEL_SELECT_CLS} onChange={e => {
                  const v = e.target.value; if (!v) return
                  const cur = rule.selector ? rule.selector.split(',').map(s => s.trim()).filter(Boolean) : []
                  if (!cur.includes(v)) set({ selector: [...cur, v].join(', ') })
                }}>
                  <option value="">+ selector</option>
                  {COMMON_SELECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </PanelField>
            </div>
          </div>
          <PanelField label="Selector">
            <PanelInput value={rule.selector} onChange={v => set({ selector: v })} placeholder="h1, .class" />
          </PanelField>

          {/* Properties */}
          <PanelField label="Font">
            <select value={rule.fontFamily} onChange={e => set({ fontFamily: e.target.value })} className={PANEL_SELECT_CLS}>
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </PanelField>
          <div className="grid grid-cols-2 gap-[6px]">
            <PanelField label="Size"><PanelInput value={rule.fontSize} onChange={v => set({ fontSize: v })} placeholder="16px" /></PanelField>
            <PanelField label="Weight"><PanelInput value={rule.fontWeight} onChange={v => set({ fontWeight: v })} placeholder="600" /></PanelField>
            <PanelField label="Line height"><PanelInput value={rule.lineHeight} onChange={v => set({ lineHeight: v })} placeholder="1.5" /></PanelField>
            <PanelField label="Tracking"><PanelInput value={rule.letterSpacing} onChange={v => set({ letterSpacing: v })} placeholder="-0.02em" /></PanelField>
            <PanelField label="Transform"><PanelInput value={rule.textTransform} onChange={v => set({ textTransform: v })} placeholder="uppercase" /></PanelField>
            <PanelField label="Color"><PanelInput value={rule.color} onChange={v => set({ color: v })} placeholder="#111" /></PanelField>
            <PanelField label="Background"><PanelInput value={rule.backgroundColor} onChange={v => set({ backgroundColor: v })} placeholder="#f5f5f5" /></PanelField>
            <PanelField label="Border W"><PanelInput value={rule.borderWidth} onChange={v => set({ borderWidth: v })} placeholder="1px" /></PanelField>
            <PanelField label="Border style">
              <select value={rule.borderStyle} onChange={e => set({ borderStyle: e.target.value })} className={PANEL_SELECT_CLS}>
                {BORDER_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </PanelField>
            <PanelField label="Border C"><PanelInput value={rule.borderColor} onChange={v => set({ borderColor: v })} placeholder="#e0e0e0" /></PanelField>
            <PanelField label="Radius"><PanelInput value={rule.borderRadius} onChange={v => set({ borderRadius: v })} placeholder="6px" /></PanelField>
            <PanelField label="Padding"><PanelInput value={rule.padding} onChange={v => set({ padding: v })} placeholder="8px" /></PanelField>
            <PanelField label="Margin"><PanelInput value={rule.margin} onChange={v => set({ margin: v })} placeholder="0 0 16px" /></PanelField>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Primitives ───────────────────────────────────────

function PanelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-on-surface-muted mb-[3px] uppercase tracking-[0.04em]">
        {label}
      </label>
      {children}
    </div>
  )
}

function PanelInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-surface-raised border border-border rounded-md px-2 py-[5px] text-[11px] text-on-surface outline-none font-[inherit] tracking-[-0.1px] focus:border-accent transition-colors duration-150"
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/features/markdown-studio/components/StylePanel.tsx
git commit -m "style: migrate StylePanel inline styles to Tailwind"
```

---

## Task 9: ExportModal.tsx

**Files:**
- Modify: `src/features/markdown-studio/components/ExportModal.tsx`

Key patterns: Style object constants (`selectStyle`, `primaryBtn`, `secondaryBtn`, `iconBtnStyle`) become Tailwind class string constants. The `Toggle` component's thumb position (`left: checked ? 16 : 2`) becomes `cn('left-4', 'left-0.5')`. The `Field` input's `onFocus/Blur` handlers become `focus:border-accent`.

- [ ] **Step 1: Replace file content**

```tsx
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { THEMES, THEME_ACCENT } from '../utils/themes'
import {
  COMMON_SELECTORS, FONT_OPTIONS, BORDER_STYLE_OPTIONS,
  createDefaultRule,
  type StyleSettings, type ElementRule,
} from '../utils/styleBuilder'
import type { ExportConfig } from '../utils/pdfExport'
import { defaultExportConfig } from '../utils/pdfExport'
import { cn } from '@/lib/utils'

// Shared class strings replacing style object constants
const SELECT_CLS = 'w-full bg-surface-raised border border-border rounded-lg px-[10px] py-1.5 text-xs text-on-surface outline-none font-[inherit] cursor-pointer'
const PRIMARY_BTN_CLS = 'px-[18px] py-[7px] rounded-full bg-accent text-accent-text border-none text-[13px] font-medium cursor-pointer font-[inherit]'
const SECONDARY_BTN_CLS = 'px-[18px] py-[7px] rounded-full bg-transparent text-accent border border-accent text-[13px] font-normal cursor-pointer font-[inherit]'
const ICON_BTN_CLS = 'flex items-center justify-center w-[30px] h-[30px] rounded-full bg-surface-raised border border-border text-on-surface-muted cursor-pointer'

interface ExportModalProps {
  open: boolean
  onClose: () => void
  onExportPDF: (config: ExportConfig) => void
  onExportHTML: (config: ExportConfig) => void
  documentTitle: string
}

type Tab = 'preset' | 'style' | 'layout'

export default function ExportModal({ open, onClose, onExportPDF, onExportHTML, documentTitle }: ExportModalProps) {
  const [tab, setTab] = useState<Tab>('preset')
  const [config, setConfig] = useState<ExportConfig>(() => defaultExportConfig(documentTitle))

  const setC = (patch: Partial<ExportConfig>) => setConfig(c => ({ ...c, ...patch }))
  const setStyle = (patch: Partial<StyleSettings>) =>
    setConfig(c => ({ ...c, styleSettings: { ...c.styleSettings, ...patch } }))
  const setDoc = (key: string, val: string) =>
    setConfig(c => ({ ...c, styleSettings: { ...c.styleSettings, document: { ...c.styleSettings.document, [key]: val } } }))
  const setRule = (i: number, patch: Partial<ElementRule>) =>
    setConfig(c => {
      const rules = [...c.styleSettings.rules]
      rules[i] = { ...rules[i], ...patch }
      return { ...c, styleSettings: { ...c.styleSettings, rules } }
    })
  const addRule = () => setStyle({ rules: [...config.styleSettings.rules, createDefaultRule()] })
  const removeRule = (i: number) => setStyle({ rules: config.styleSettings.rules.filter((_, j) => j !== i) })
  const resetStyle = () => setStyle({ document: { fontFamily: '', color: '', backgroundColor: '', borderWidth: '', borderStyle: '', borderColor: '', borderRadius: '', padding: '' }, rules: [] })

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/55 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[620px] max-h-[88vh] flex flex-col bg-surface border border-border rounded-[18px] shadow-[0_24px_64px_rgba(0,0,0,0.3)] z-[51] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 shrink-0">
            <div>
              <Dialog.Title className="text-[18px] font-semibold tracking-[-0.4px] text-on-surface">
                Export Document
              </Dialog.Title>
              <Dialog.Description className="text-xs text-on-surface-muted mt-0.5">
                Configure theme, styles, and layout before exporting.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className={ICON_BTN_CLS}><X size={15} /></button>
            </Dialog.Close>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 px-6 pt-[14px] border-b border-border shrink-0">
            {(['preset', 'style', 'layout'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-[14px] py-1.5 rounded-t-lg border-none cursor-pointer font-[inherit] text-[13px] tracking-[-0.2px] border-b-2 -mb-px',
                  tab === t
                    ? 'bg-surface-raised text-on-surface font-semibold border-b-accent'
                    : 'bg-transparent text-on-surface-muted font-normal border-b-transparent'
                )}
              >
                {t === 'preset' ? 'Preset' : t === 'style' ? 'Styles' : 'Layout'}
              </button>
            ))}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'preset' && <PresetTab config={config} setC={setC} />}
            {tab === 'style' && <StyleTab config={config} setDoc={setDoc} setRule={setRule} addRule={addRule} removeRule={removeRule} resetStyle={resetStyle} />}
            {tab === 'layout' && <LayoutTab config={config} setC={setC} />}
          </div>

          {/* Footer */}
          <div className="flex gap-[10px] justify-end px-6 py-[14px] border-t border-border shrink-0">
            <button onClick={() => { onExportHTML(config); onClose() }} className={SECONDARY_BTN_CLS}>
              Export HTML
            </button>
            <button onClick={() => { onExportPDF(config); onClose() }} className={PRIMARY_BTN_CLS}>
              Export PDF
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Preset Tab ──────────────────────────────────────

function PresetTab({ config, setC }: { config: ExportConfig; setC: (p: Partial<ExportConfig>) => void }) {
  return (
    <div className="grid grid-cols-3 gap-[10px]">
      {THEMES.map(t => {
        const accent = THEME_ACCENT[t.id] ?? '#333'
        const active = config.themeId === t.id
        return (
          <button
            key={t.id}
            onClick={() => setC({ themeId: t.id })}
            className={cn(
              'flex flex-col gap-[10px] p-3 rounded-[11px] border-2 cursor-pointer font-[inherit] text-left transition-colors duration-150',
              active ? 'border-accent bg-surface-raised' : 'border-border bg-transparent'
            )}
          >
            {/* Color preview */}
            <div className="w-full h-11 rounded-md bg-white border border-black/[0.08] shrink-0 relative overflow-hidden">
              <div className="absolute top-2 left-[10px] right-[10px]">
                <div className="h-1 rounded-sm mb-[3px]" style={{ backgroundColor: t.colors.h1, width: '70%' }} />
                <div className="h-[3px] rounded-sm mb-[3px]" style={{ backgroundColor: t.colors.h2, width: '50%' }} />
                <div className="h-[3px] rounded-sm" style={{ backgroundColor: t.colors.h3, width: '40%' }} />
              </div>
              {t.colors.blockquoteBorder && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: accent }} />
              )}
            </div>
            <div>
              <div className={cn('text-xs text-on-surface tracking-[-0.15px]', active ? 'font-semibold' : 'font-medium')}>
                {t.label}
              </div>
              <div className="text-[10px] text-on-surface-muted mt-0.5">
                {t.fontBody.split(',')[0].replace(/"/g, '')}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Style Tab ───────────────────────────────────────

function StyleTab({ config, setDoc, setRule, addRule, removeRule, resetStyle }: {
  config: ExportConfig
  setDoc: (k: string, v: string) => void
  setRule: (i: number, p: Partial<ElementRule>) => void
  addRule: () => void
  removeRule: (i: number) => void
  resetStyle: () => void
}) {
  const doc = config.styleSettings.document

  return (
    <div className="flex flex-col gap-6">
      {/* Advanced Document Settings */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Advanced Settings</SectionLabel>
          <button onClick={resetStyle} className="text-[11px] text-accent bg-transparent border-none cursor-pointer font-[inherit]">
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-[10px]">
          <div className="col-span-full">
            <FieldLabel>Document font</FieldLabel>
            <select value={doc.fontFamily} onChange={e => setDoc('fontFamily', e.target.value)} className={SELECT_CLS}>
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <Field label="Text color" value={doc.color} onChange={v => setDoc('color', v)} placeholder="#111627" />
          <Field label="Background" value={doc.backgroundColor} onChange={v => setDoc('backgroundColor', v)} placeholder="#ffffff" />
          <Field label="Border width" value={doc.borderWidth} onChange={v => setDoc('borderWidth', v)} placeholder="1.5px" />
          <div>
            <FieldLabel>Border style</FieldLabel>
            <select value={doc.borderStyle} onChange={e => setDoc('borderStyle', e.target.value)} className={SELECT_CLS}>
              {BORDER_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <Field label="Border color" value={doc.borderColor} onChange={v => setDoc('borderColor', v)} placeholder="#0f172a" />
          <Field label="Border radius" value={doc.borderRadius} onChange={v => setDoc('borderRadius', v)} placeholder="0" />
          <Field label="Inner padding" value={doc.padding} onChange={v => setDoc('padding', v)} placeholder="22px 18px" />
        </div>
      </section>

      {/* Element Rules */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Element Rules</SectionLabel>
          <button
            onClick={addRule}
            className="flex items-center gap-1 text-xs font-medium text-accent bg-transparent border border-accent rounded-md px-[10px] py-1 cursor-pointer font-[inherit]"
          >
            <Plus size={12} /> Add Rule
          </button>
        </div>

        {config.styleSettings.rules.length === 0 && (
          <p className="text-xs text-on-surface-muted py-3">
            No rules yet. Add a rule to override styles for specific elements.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {config.styleSettings.rules.map((rule, i) => (
            <ExportRuleCard key={i} rule={rule} index={i} onChange={setRule} onRemove={removeRule} />
          ))}
        </div>
      </section>
    </div>
  )
}

function ExportRuleCard({ rule, index, onChange, onRemove }: {
  rule: ElementRule; index: number
  onChange: (i: number, p: Partial<ElementRule>) => void
  onRemove: (i: number) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const set = (patch: Partial<ElementRule>) => onChange(index, patch)

  return (
    <div className="border border-border rounded-[11px] overflow-hidden">
      {/* Rule header */}
      <div
        className="flex items-center gap-2 px-3 py-[10px] bg-surface-raised cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-[11px] font-semibold text-on-surface-muted tracking-[0.04em] uppercase">
          Rule {index + 1}
        </span>
        <span className="text-xs text-accent font-mono">{rule.selector || 'no selector'}</span>
        <div className="flex-1" />
        <button
          onClick={e => { e.stopPropagation(); onRemove(index) }}
          className="flex text-on-surface-muted bg-transparent border-none cursor-pointer p-0.5"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {expanded && (
        <div className="p-3 flex flex-col gap-[10px]">
          {/* Selector row */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <FieldLabel>Common selectors</FieldLabel>
              <select
                className={SELECT_CLS}
                onChange={e => {
                  const val = e.target.value
                  if (!val) return
                  const current = rule.selector ? rule.selector.split(',').map(s => s.trim()).filter(Boolean) : []
                  if (!current.includes(val)) {
                    set({ selector: [...current, val].join(', ') })
                  }
                }}
              >
                <option value="">+ Add selector</option>
                {COMMON_SELECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <Field label="Custom selector" value={rule.selector} onChange={v => set({ selector: v })} placeholder="e.g. h1, .myClass" />
            </div>
          </div>

          {/* Properties grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-full">
              <FieldLabel>Font family</FieldLabel>
              <select value={rule.fontFamily} onChange={e => set({ fontFamily: e.target.value })} className={SELECT_CLS}>
                {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <Field label="Font size" value={rule.fontSize} onChange={v => set({ fontSize: v })} placeholder="16px" />
            <Field label="Font weight" value={rule.fontWeight} onChange={v => set({ fontWeight: v })} placeholder="600" />
            <Field label="Line height" value={rule.lineHeight} onChange={v => set({ lineHeight: v })} placeholder="1.5" />
            <Field label="Letter spacing" value={rule.letterSpacing} onChange={v => set({ letterSpacing: v })} placeholder="-0.02em" />
            <Field label="Text transform" value={rule.textTransform} onChange={v => set({ textTransform: v })} placeholder="uppercase" />
            <Field label="Color" value={rule.color} onChange={v => set({ color: v })} placeholder="#111" />
            <Field label="Background" value={rule.backgroundColor} onChange={v => set({ backgroundColor: v })} placeholder="#f5f5f5" />
            <Field label="Border width" value={rule.borderWidth} onChange={v => set({ borderWidth: v })} placeholder="1px" />
            <div>
              <FieldLabel>Border style</FieldLabel>
              <select value={rule.borderStyle} onChange={e => set({ borderStyle: e.target.value })} className={SELECT_CLS}>
                {BORDER_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <Field label="Border color" value={rule.borderColor} onChange={v => set({ borderColor: v })} placeholder="#e0e0e0" />
            <Field label="Border radius" value={rule.borderRadius} onChange={v => set({ borderRadius: v })} placeholder="6px" />
            <Field label="Padding" value={rule.padding} onChange={v => set({ padding: v })} placeholder="8px 12px" />
            <Field label="Margin" value={rule.margin} onChange={v => set({ margin: v })} placeholder="0 0 16px" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Layout Tab ──────────────────────────────────────

function LayoutTab({ config, setC }: { config: ExportConfig; setC: (p: Partial<ExportConfig>) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionLabel>Cover Page</SectionLabel>
        <div className="mt-[10px] flex flex-col gap-[10px]">
          <Toggle label="Include cover page" checked={config.coverPage} onChange={v => setC({ coverPage: v })} />
          {config.coverPage && (
            <div className="grid grid-cols-2 gap-[10px] mt-1">
              <div className="col-span-full">
                <Field label="Title" value={config.coverTitle} onChange={v => setC({ coverTitle: v })} placeholder="Document title" />
              </div>
              <div className="col-span-full">
                <Field label="Subtitle" value={config.coverSubtitle} onChange={v => setC({ coverSubtitle: v })} placeholder="Optional subtitle" />
              </div>
              <Field label="Author" value={config.coverAuthor} onChange={v => setC({ coverAuthor: v })} placeholder="Your name" />
              <Field label="Date" value={config.coverDate} onChange={v => setC({ coverDate: v })} placeholder="June 16, 2026" />
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Header</SectionLabel>
        <div className="mt-[10px] flex flex-col gap-[10px]">
          <Toggle label="Show page header" checked={config.showHeader} onChange={v => setC({ showHeader: v })} />
          {config.showHeader && (
            <div className="grid grid-cols-3 gap-[10px] mt-1">
              <Field label="Left" value={config.headerLeft} onChange={v => setC({ headerLeft: v })} placeholder="Company" />
              <Field label="Center" value={config.headerCenter} onChange={v => setC({ headerCenter: v })} placeholder="Doc title" />
              <Field label="Right" value={config.headerRight} onChange={v => setC({ headerRight: v })} placeholder="v1.0" />
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Footer</SectionLabel>
        <div className="mt-[10px] flex flex-col gap-[10px]">
          <Toggle label="Show page footer" checked={config.showFooter} onChange={v => setC({ showFooter: v })} />
          {config.showFooter && (
            <Toggle label="Page numbers" checked={config.footerPageNumbers} onChange={v => setC({ footerPageNumbers: v })} />
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Watermark</SectionLabel>
        <div className="mt-[10px]">
          <Field
            label="Watermark text (leave empty for none)"
            value={config.watermark}
            onChange={v => setC({ watermark: v })}
            placeholder="e.g. DRAFT or CONFIDENTIAL"
          />
        </div>
      </section>
    </div>
  )
}

// ── Shared primitives ────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-on-surface-muted">
      {children}
    </p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-on-surface-muted mb-1">
      {children}
    </label>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface-raised border border-border rounded-lg px-[10px] py-1.5 text-xs text-on-surface outline-none font-[inherit] tracking-[-0.15px] focus:border-accent transition-colors duration-150"
      />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-[10px] cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={cn(
          'w-[34px] h-[18px] rounded-full shrink-0 relative cursor-pointer transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-border'
        )}
      >
        <div className={cn(
          'absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-[left] duration-200',
          checked ? 'left-4' : 'left-0.5'
        )} />
      </div>
      <span className="text-[13px] text-on-surface tracking-[-0.2px]">{label}</span>
    </label>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/features/markdown-studio/components/ExportModal.tsx
git commit -m "style: migrate ExportModal inline styles to Tailwind"
```

---

## Task 10: Final verification

- [ ] **Step 1: Confirm zero inline style blocks remain (except 2 permitted in SettingsPage)**

```bash
grep -rn "style={{" src/components/layout/Topbar.tsx src/components/layout/Sidebar.tsx src/features/markdown-studio/components/Toolbar.tsx src/features/markdown-studio/index.tsx src/features/markdown-studio/components/PreviewPane.tsx src/pages/HomePage.tsx src/features/markdown-studio/components/StylePanel.tsx src/features/markdown-studio/components/ExportModal.tsx
```
Expected: no output

```bash
grep -n "style={{" src/pages/SettingsPage.tsx
```
Expected: exactly 2 lines (the swatch background and accent dot)

- [ ] **Step 2: Full TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "style: complete inline-styles-to-tailwind migration"
```
