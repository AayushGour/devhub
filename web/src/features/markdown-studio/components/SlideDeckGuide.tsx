import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { X, Presentation } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatInline } from './guideInlineFormat'
import { Code } from './GuideCode'
import guideData from '../data/slideDeckGuide.json'

interface SlideDeckGuideProps {
  open: boolean
  onClose: () => void
}

type Tab = 'overview' | 'types' | 'fields' | 'example'

// In-app authoring reference for Slide Deck mode — content lives entirely in
// data/slideDeckGuide.json (a condensed, always-current mirror of
// docs/skills/slide-deck-markdown/SKILL.md). This component is a thin, generic
// renderer over that JSON: to add/change a rule, guardrail, type row, or the worked
// example, edit the JSON — nothing here needs to change. `formatInline` (see
// guideInlineFormat.tsx) supports `code` spans and **bold** inside any JSON string.
export default function SlideDeckGuide({ open, onClose }: SlideDeckGuideProps) {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/55 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[42rem] max-h-[88vh] flex flex-col bg-surface border border-border rounded-[1.12rem] shadow-[0_1.5rem_4rem_rgba(0,0,0,0.3)] z-[51] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 text-accent">
                <Presentation size={17} />
              </span>
              <div>
                <Dialog.Title className="text-[1.12rem] font-semibold tracking-[-0.03rem] text-on-surface">
                  {guideData.header.title}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-on-surface-muted mt-0.5">
                  {guideData.header.description}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="flex items-center justify-center w-[1.88rem] h-[1.88rem] rounded-full bg-surface-raised border border-border text-on-surface-muted cursor-pointer hover:text-on-surface transition-colors duration-150"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 px-6 pt-[0.88rem] border-b border-border shrink-0">
            {guideData.tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as Tab)}
                className={cn(
                  'px-[0.88rem] py-1.5 rounded-t-lg border-none cursor-pointer font-[inherit] text-[0.81rem] tracking-[-0.01rem] border-b-2 -mb-px transition-colors duration-150',
                  tab === t.id
                    ? 'bg-surface-raised text-on-surface font-semibold border-b-accent'
                    : 'bg-transparent text-on-surface-muted font-normal border-b-transparent hover:text-on-surface'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-6 text-[0.83rem] leading-relaxed text-on-surface">
            {tab === 'overview' && <OverviewTab />}
            {tab === 'types' && <TypesTab />}
            {tab === 'fields' && <FieldsTab />}
            {tab === 'example' && <ExampleTab />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Tabs ─────────────────────────────────────────────

function OverviewTab() {
  const { intro, rules } = guideData.overview
  return (
    <div className="flex flex-col gap-4">
      <p>{intro}</p>
      {rules.map(rule => (
        <Rule key={rule.label} label={rule.label}>{formatInline(rule.body)}</Rule>
      ))}
    </div>
  )
}

function TypesTab() {
  const { intro, table, rules } = guideData.types
  return (
    <div className="flex flex-col gap-4">
      <p className="text-on-surface-muted">{formatInline(intro)}</p>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-surface-raised text-on-surface-muted">
              <Th>type</Th>
              <Th>yaml slots</Th>
              <Th>body markdown</Th>
            </tr>
          </thead>
          <tbody>
            {table.map(row => (
              <TypeRow key={row.type} type={row.type} slots={row.slots} body={row.body} />
            ))}
          </tbody>
        </table>
      </div>
      {rules.map(rule => (
        <Rule key={rule.label} label={rule.label}>{formatInline(rule.body)}</Rule>
      ))}
    </div>
  )
}

function FieldsTab() {
  const { intro, rules, guardrailsTitle, guardrailsIntro, guardrails, overflow } = guideData.fields
  return (
    <div className="flex flex-col gap-4">
      <p className="text-on-surface-muted">{intro}</p>

      {rules.map(rule => (
        <Rule key={rule.label} label={rule.label}>{formatInline(rule.body)}</Rule>
      ))}

      <div className="mt-1">
        <p className="text-[0.69rem] font-semibold tracking-[0.06em] uppercase text-on-surface-muted mb-2">
          {guardrailsTitle}
        </p>
        <p className="text-on-surface-muted mb-2">{guardrailsIntro}</p>
        <ul className="flex flex-col gap-1.5">
          {guardrails.map(g => (
            <Guard key={g.key} k={g.key}>{formatInline(g.body)}</Guard>
          ))}
        </ul>
      </div>

      <Rule label={overflow.label}>{formatInline(overflow.body)}</Rule>
    </div>
  )
}

function ExampleTab() {
  const { description, code } = guideData.example
  return (
    <div className="flex flex-col gap-3">
      <p className="text-on-surface-muted">{formatInline(description)}</p>
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface-raised p-4 text-[0.72rem] leading-relaxed text-on-surface font-mono">
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ── Primitives ───────────────────────────────────────

function Rule({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.69rem] font-semibold tracking-[0.06em] uppercase text-accent">{label}</span>
      <p className="text-on-surface">{children}</p>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-semibold px-3 py-2 border-b border-border">{children}</th>
}

function TypeRow({ type, slots, body }: { type: string; slots: string; body: string }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-2 align-top">
        <Code>{type}</Code>
      </td>
      <td className="px-3 py-2 align-top text-on-surface-muted font-mono text-[0.72rem]">{slots}</td>
      <td className="px-3 py-2 align-top text-on-surface-muted">{body}</td>
    </tr>
  )
}

function Guard({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <code className="shrink-0 font-mono text-accent text-[0.78em] mt-px">{k}</code>
      <span className="text-on-surface-muted">{children}</span>
    </li>
  )
}
