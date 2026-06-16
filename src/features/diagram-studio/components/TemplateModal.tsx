import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState } from 'react'
import { TEMPLATES, DIAGRAM_TYPE_LABELS, type DiagramType } from '../utils/diagramTemplates'
import { cn } from '@/lib/utils'

const ICON_BTN_CLS = 'flex items-center justify-center w-[30px] h-[30px] rounded-full bg-surface-raised border border-border text-on-surface-muted cursor-pointer'

const TYPES: (DiagramType | 'all')[] = ['all', 'flowchart', 'sequence', 'er', 'state', 'class', 'gantt']

interface TemplateModalProps {
  open: boolean
  onClose: () => void
  onSelect: (code: string) => void
}

export default function TemplateModal({ open, onClose, onSelect }: TemplateModalProps) {
  const [filter, setFilter] = useState<DiagramType | 'all'>('all')

  const filtered = filter === 'all' ? TEMPLATES : TEMPLATES.filter(t => t.type === filter)

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/55 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[700px] max-h-[82vh] flex flex-col bg-surface border border-border rounded-[18px] shadow-[0_24px_64px_rgba(0,0,0,0.3)] z-[51] overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 shrink-0">
            <div>
              <Dialog.Title className="text-[18px] font-semibold tracking-[-0.4px] text-on-surface">
                Diagram Templates
              </Dialog.Title>
              <Dialog.Description className="text-xs text-on-surface-muted mt-0.5">
                Pick a starting point — it replaces your current diagram.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className={ICON_BTN_CLS}><X size={15} /></button>
            </Dialog.Close>
          </div>

          <div className="flex gap-0.5 px-6 pt-[14px] border-b border-border shrink-0 overflow-x-auto">
            {TYPES.map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={cn(
                  'px-[12px] py-1.5 rounded-t-lg border-none cursor-pointer font-[inherit] text-[12px] tracking-[-0.2px] border-b-2 -mb-px whitespace-nowrap',
                  filter === t
                    ? 'bg-surface-raised text-on-surface font-semibold border-b-accent'
                    : 'bg-transparent text-on-surface-muted font-normal border-b-transparent'
                )}
              >
                {t === 'all' ? 'All' : DIAGRAM_TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-[10px]">
              {filtered.map(template => (
                <button
                  key={template.id}
                  onClick={() => { onSelect(template.code); onClose() }}
                  className={cn(
                    'flex flex-col gap-2 p-4 rounded-[14px] border border-border bg-transparent cursor-pointer font-[inherit] text-left',
                    'hover:border-accent hover:bg-surface-raised transition-[border-color,background-color] duration-150'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-semibold text-on-surface tracking-[-0.2px]">
                      {template.label}
                    </p>
                    <span className="text-[10px] font-medium text-on-surface-muted bg-surface-raised border border-border rounded-full px-2 py-0.5 shrink-0">
                      {DIAGRAM_TYPE_LABELS[template.type]}
                    </span>
                  </div>
                  <p className="text-[12px] text-on-surface-muted leading-[1.4]">
                    {template.description}
                  </p>
                  <pre className="text-[10px] text-on-surface-muted/50 font-mono overflow-hidden leading-relaxed mt-1">
                    {template.code.split('\n').slice(0, 3).join('\n')}
                  </pre>
                </button>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
