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

const SELECT_CLS = 'w-full bg-surface-raised border border-border rounded-lg px-[0.62rem] py-1.5 text-xs text-on-surface outline-none font-[inherit] cursor-pointer'
const PRIMARY_BTN_CLS = 'px-[1.12rem] py-[0.44rem] rounded-full bg-accent text-accent-text border-none text-[0.81rem] font-medium cursor-pointer font-[inherit]'
const SECONDARY_BTN_CLS = 'px-[1.12rem] py-[0.44rem] rounded-full bg-transparent text-accent border border-accent text-[0.81rem] font-normal cursor-pointer font-[inherit]'
const ICON_BTN_CLS = 'flex items-center justify-center w-[1.88rem] h-[1.88rem] rounded-full bg-surface-raised border border-border text-on-surface-muted cursor-pointer'

interface ExportModalProps {
  open: boolean
  onClose: () => void
  onExportPDF: (config: ExportConfig) => void
  onExportHTML: (config: ExportConfig) => void
  documentTitle: string
  deckMode: boolean
  onExportDeck: (config: ExportConfig) => void
}

type Tab = 'preset' | 'style' | 'layout'

export default function ExportModal({ open, onClose, onExportPDF, onExportHTML, documentTitle, deckMode, onExportDeck }: ExportModalProps) {
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
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[38.75rem] max-h-[88vh] flex flex-col bg-surface border border-border rounded-[1.12rem] shadow-[0_1.5rem_4rem_rgba(0,0,0,0.3)] z-[51] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 shrink-0">
            <div>
              <Dialog.Title className="text-[1.12rem] font-semibold tracking-[-0.03rem] text-on-surface">
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
          <div className="flex gap-0.5 px-6 pt-[0.88rem] border-b border-border shrink-0">
            {(['preset', 'style', 'layout'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-[0.88rem] py-1.5 rounded-t-lg border-none cursor-pointer font-[inherit] text-[0.81rem] tracking-[-0.01rem] border-b-2 -mb-px',
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
            {tab === 'layout' && <LayoutTab config={config} setC={setC} deckMode={deckMode} />}
          </div>

          {/* Footer */}
          <div className="flex gap-[0.62rem] justify-end px-6 py-[0.88rem] border-t border-border shrink-0">
            <button onClick={() => { onExportHTML(config); onClose() }} className={SECONDARY_BTN_CLS}>
              Export HTML
            </button>
            {deckMode ? (
              <button onClick={() => { onExportDeck(config); onClose() }} className={PRIMARY_BTN_CLS}>
                Slide Deck (PDF)
              </button>
            ) : (
              <button onClick={() => { onExportPDF(config); onClose() }} className={PRIMARY_BTN_CLS}>
                Export PDF
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Preset Tab ──────────────────────────────────────

function PresetTab({ config, setC }: { config: ExportConfig; setC: (p: Partial<ExportConfig>) => void }) {
  return (
    <div className="grid grid-cols-3 gap-[0.62rem]">
      {THEMES.map(t => {
        const accent = THEME_ACCENT[t.id] ?? '#333'
        const active = config.themeId === t.id
        return (
          <button
            key={t.id}
            onClick={() => setC({ themeId: t.id })}
            className={cn(
              'flex flex-col gap-[0.62rem] p-3 rounded-[0.69rem] border-2 cursor-pointer font-[inherit] text-left transition-colors duration-150',
              active ? 'border-accent bg-surface-raised' : 'border-border bg-transparent'
            )}
          >
            {/* Color preview */}
            <div className="w-full h-11 rounded-md bg-white border border-black/[0.08] shrink-0 relative overflow-hidden">
              <div className="absolute top-2 left-[0.62rem] right-[0.62rem]">
                <div className="h-1 rounded-sm mb-[0.19rem]" style={{ backgroundColor: t.colors.h1, width: '70%' }} />
                <div className="h-[0.19rem] rounded-sm mb-[0.19rem]" style={{ backgroundColor: t.colors.h2, width: '50%' }} />
                <div className="h-[0.19rem] rounded-sm" style={{ backgroundColor: t.colors.h3, width: '40%' }} />
              </div>
              {t.colors.blockquoteBorder && (
                <div className="absolute left-0 top-0 bottom-0 w-[0.19rem]" style={{ backgroundColor: accent }} />
              )}
            </div>
            <div>
              <div className={cn('text-xs text-on-surface tracking-[-0.01rem]', active ? 'font-semibold' : 'font-medium')}>
                {t.label}
              </div>
              <div className="text-[0.62rem] text-on-surface-muted mt-0.5">
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
          <button onClick={resetStyle} className="text-[0.69rem] text-accent bg-transparent border-none cursor-pointer font-[inherit]">
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-[0.62rem]">
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
            className="flex items-center gap-1 text-xs font-medium text-accent bg-transparent border border-accent rounded-md px-[0.62rem] py-1 cursor-pointer font-[inherit]"
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
    <div className="border border-border rounded-[0.69rem] overflow-hidden">
      {/* Rule header */}
      <div
        className="flex items-center gap-2 px-3 py-[0.62rem] bg-surface-raised cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-[0.69rem] font-semibold text-on-surface-muted tracking-[0.04em] uppercase">
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
        <div className="p-3 flex flex-col gap-[0.62rem]">
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

function LayoutTab({ config, setC, deckMode }: { config: ExportConfig; setC: (p: Partial<ExportConfig>) => void; deckMode: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {!deckMode && (
        <section>
          <SectionLabel>Cover Page</SectionLabel>
          <div className="mt-[0.62rem] flex flex-col gap-[0.62rem]">
            <Toggle label="Include cover page" checked={config.coverPage} onChange={v => setC({ coverPage: v })} />
            {config.coverPage && (
              <div className="grid grid-cols-2 gap-[0.62rem] mt-1">
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
      )}

      <section>
        <SectionLabel>Header</SectionLabel>
        <div className="mt-[0.62rem] flex flex-col gap-[0.62rem]">
          <Toggle label="Show page header" checked={config.showHeader} onChange={v => setC({ showHeader: v })} />
          {config.showHeader && (
            <div className="grid grid-cols-3 gap-[0.62rem] mt-1">
              <Field label="Left" value={config.headerLeft} onChange={v => setC({ headerLeft: v })} placeholder="Company" />
              <Field label="Center" value={config.headerCenter} onChange={v => setC({ headerCenter: v })} placeholder="Doc title" />
              <Field label="Right" value={config.headerRight} onChange={v => setC({ headerRight: v })} placeholder="v1.0" />
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Footer</SectionLabel>
        <div className="mt-[0.62rem] flex flex-col gap-[0.62rem]">
          <Toggle label="Show page footer" checked={config.showFooter} onChange={v => setC({ showFooter: v })} />
          {config.showFooter && (
            <Toggle label="Page numbers" checked={config.footerPageNumbers} onChange={v => setC({ footerPageNumbers: v })} />
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Watermark</SectionLabel>
        <div className="mt-[0.62rem]">
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
    <p className="text-[0.69rem] font-semibold tracking-[0.06em] uppercase text-on-surface-muted">
      {children}
    </p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[0.69rem] font-medium text-on-surface-muted mb-1">
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
        className="w-full bg-surface-raised border border-border rounded-lg px-[0.62rem] py-1.5 text-xs text-on-surface outline-none font-[inherit] tracking-[-0.01rem] focus:border-accent transition-colors duration-150"
      />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-[0.62rem] cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={cn(
          'w-[2.12rem] h-[1.12rem] rounded-full shrink-0 relative cursor-pointer transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-border'
        )}
      >
        <div className={cn(
          'absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-[0_0.06rem_0.19rem_rgba(0,0,0,0.2)] transition-[left] duration-200',
          checked ? 'left-4' : 'left-0.5'
        )} />
      </div>
      <span className="text-[0.81rem] text-on-surface tracking-[-0.01rem]">{label}</span>
    </label>
  )
}
