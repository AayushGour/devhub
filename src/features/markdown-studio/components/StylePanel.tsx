import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Folder, FileText, Pencil, Check } from 'lucide-react'
import { THEMES, THEME_ACCENT } from '../utils/themes'
import {
  COMMON_SELECTORS, FONT_OPTIONS, BORDER_STYLE_OPTIONS,
  type StyleSettings, type ElementRule,
} from '../utils/styleBuilder'
import type { MdFile } from '../hooks/useMarkdownEditor'
import { cn } from '@/lib/utils'

const PANEL_SELECT_CLS = 'w-full bg-surface-raised border border-border rounded-md px-2 py-[0.31rem] text-[0.69rem] text-on-surface outline-none font-[inherit] cursor-pointer'
const DASHED_BTN_CLS = 'flex items-center justify-center gap-[0.38rem] py-[0.44rem] px-3 rounded-lg border border-dashed border-border bg-transparent text-on-surface-muted text-xs cursor-pointer font-[inherit] w-full hover:border-accent hover:text-accent transition-colors duration-150'

type Section = 'files' | 'preset' | 'document' | 'elements'

const SECTION_LABELS: Record<Section, string> = {
  files: 'Files',
  preset: 'Preset',
  document: 'Doc',
  elements: 'Elements',
}

interface StylePanelProps {
  themeId: string
  styleSettings: StyleSettings
  files: MdFile[]
  activeId: string
  onThemeChange: (id: string) => void
  onDocChange: (key: string, val: string) => void
  onRuleChange: (i: number, patch: Partial<ElementRule>) => void
  onAddRule: () => void
  onRemoveRule: (i: number) => void
  onResetStyles: () => void
  onSelectFile: (id: string) => void
  onRenameFile: (id: string, name: string) => void
  onRemoveFile: (id: string) => void
  onNewFile: () => void
}

export default function StylePanel({
  themeId, styleSettings, files, activeId,
  onThemeChange, onDocChange,
  onRuleChange, onAddRule, onRemoveRule, onResetStyles,
  onSelectFile, onRenameFile, onRemoveFile, onNewFile,
}: StylePanelProps) {
  const [section, setSection] = useState<Section>('files')

  return (
    <aside className="w-[17.5rem] shrink-0 flex flex-col border-l border-border bg-surface overflow-hidden">
      {/* Section tabs */}
      <div className="flex border-b border-border shrink-0">
        {(['files', 'preset', 'document', 'elements'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-[0.56rem] px-1 border-none bg-transparent cursor-pointer font-[inherit] text-[0.69rem] uppercase tracking-[0.02em] transition-colors duration-150 -mb-px border-b-2',
              section === s
                ? 'text-accent border-b-accent font-semibold'
                : 'text-on-surface-muted border-b-transparent font-normal'
            )}
          >
            {s === 'files' && <Folder size={12} />}
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-[0.88rem]">
        {section === 'files' && (
          <FilesSection
            files={files}
            activeId={activeId}
            onSelectFile={onSelectFile}
            onRenameFile={onRenameFile}
            onRemoveFile={onRemoveFile}
            onNewFile={onNewFile}
          />
        )}
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

// ── Files ────────────────────────────────────────────

function FilesSection({ files, activeId, onSelectFile, onRenameFile, onRemoveFile, onNewFile }: {
  files: MdFile[]
  activeId: string
  onSelectFile: (id: string) => void
  onRenameFile: (id: string, name: string) => void
  onRemoveFile: (id: string) => void
  onNewFile: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <button onClick={onNewFile} className={DASHED_BTN_CLS}>
        <Plus size={13} /> New File
      </button>

      {files.map(file => (
        <FileRow
          key={file.id}
          file={file}
          active={file.id === activeId}
          canRemove={files.length > 1}
          onSelect={onSelectFile}
          onRename={onRenameFile}
          onRemove={onRemoveFile}
        />
      ))}
    </div>
  )
}

function FileRow({ file, active, canRemove, onSelect, onRename, onRemove }: {
  file: MdFile
  active: boolean
  canRemove: boolean
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(file.name)

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraft(file.name)
    setEditing(true)
  }

  const commit = () => {
    onRename(file.id, draft.trim() || 'Untitled')
    setEditing(false)
  }

  return (
    <div
      onClick={() => !editing && onSelect(file.id)}
      className={cn(
        'flex items-center gap-2 px-[0.62rem] py-2 rounded-[0.62rem] border transition-[border-color,background-color] duration-150',
        editing ? 'cursor-default' : 'cursor-pointer',
        active ? 'border-accent bg-surface-raised' : 'border-border bg-transparent'
      )}
    >
      <FileText size={14} className={cn('shrink-0', active ? 'text-accent' : 'text-on-surface-muted')} />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onClick={e => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') { setDraft(file.name); setEditing(false) }
          }}
          placeholder="Untitled"
          className="flex-1 min-w-0 bg-surface border border-border rounded px-1.5 py-0.5 text-xs text-on-surface outline-none font-[inherit] tracking-[-0.01rem] focus:border-accent transition-colors duration-150"
        />
      ) : (
        <span className="flex-1 min-w-0 truncate text-xs text-on-surface tracking-[-0.01rem]">
          {file.name || 'Untitled'}
        </span>
      )}

      <button
        onClick={editing ? e => { e.stopPropagation(); commit() } : startEdit}
        title={editing ? 'Save name' : 'Rename file'}
        className="text-on-surface-muted bg-transparent border-none cursor-pointer flex p-0.5 shrink-0 hover:text-accent transition-colors duration-150"
      >
        {editing ? <Check size={13} /> : <Pencil size={12} />}
      </button>

      {canRemove && !editing && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(file.id) }}
          title="Remove file"
          className="text-on-surface-muted bg-transparent border-none cursor-pointer flex p-0.5 shrink-0 hover:text-on-surface transition-colors duration-150"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
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
              'flex items-center gap-3 px-[0.62rem] py-2 rounded-[0.62rem] border cursor-pointer font-[inherit] text-left w-full transition-[border-color,background-color] duration-150',
              active ? 'border-accent bg-surface-raised' : 'border-border bg-transparent'
            )}
          >
            {/* Mini color swatch */}
            <div className="w-9 h-7 rounded-[0.31rem] bg-white border border-black/[0.08] shrink-0 relative overflow-hidden">
              <div className="absolute top-[0.31rem] left-[0.31rem] right-[0.31rem]">
                <div className="h-[0.19rem] rounded-sm mb-0.5" style={{ backgroundColor: t.colors.h1, width: '80%' }} />
                <div className="h-0.5 rounded-sm mb-0.5" style={{ backgroundColor: t.colors.h2, width: '60%' }} />
                <div className="h-0.5 rounded-sm" style={{ backgroundColor: t.colors.h3, width: '45%' }} />
              </div>
              {t.colors.blockquoteBorder && (
                <div className="absolute left-0 top-0 bottom-0 w-[0.16rem]" style={{ backgroundColor: THEME_ACCENT[t.id] }} />
              )}
            </div>
            <div>
              <div className={cn('text-xs text-on-surface tracking-[-0.01rem]', active ? 'font-semibold' : 'font-medium')}>
                {t.label}
              </div>
              <div className="text-[0.62rem] text-on-surface-muted mt-px">
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
    <div className="flex flex-col gap-[0.62rem]">
      <div className="flex justify-end">
        <button onClick={onReset} className="text-[0.69rem] text-accent bg-transparent border-none cursor-pointer font-[inherit]">
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
    <div className="flex flex-col gap-[0.62rem]">
      <button onClick={onAddRule} className={DASHED_BTN_CLS}>
        <Plus size={13} /> Add Element Rule
      </button>

      {rules.length === 0 && (
        <p className="text-[0.69rem] text-on-surface-muted text-center py-3">
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
    <div className="border border-border rounded-[0.62rem] overflow-hidden">
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-[0.38rem] px-[0.62rem] py-2 bg-surface-raised cursor-pointer"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="text-[0.62rem] font-semibold text-on-surface-muted uppercase tracking-[0.04em]">
          Rule {index + 1}
        </span>
        <span className="text-[0.69rem] text-accent font-mono flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
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
        <div className="p-[0.62rem] flex flex-col gap-2">
          {/* Selector */}
          <div className="flex gap-[0.38rem]">
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
          <div className="grid grid-cols-2 gap-[0.38rem]">
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
      <label className="block text-[0.62rem] font-medium text-on-surface-muted mb-[0.19rem] uppercase tracking-[0.04em]">
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
      className="w-full bg-surface-raised border border-border rounded-md px-2 py-[0.31rem] text-[0.69rem] text-on-surface outline-none font-[inherit] tracking-[-0.01rem] focus:border-accent transition-colors duration-150"
    />
  )
}
