import {
  FileText, GitGraph, Braces, Globe, Database,
  KeyRound, Wrench, FolderOpen, Sparkles, BrainCircuit, Cpu, Spline, ImageDown,
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
    status: 'available',
    phase: 'Phase 3',
    href: '/tools/diagram',
  },
  {
    id: 'rag',
    title: 'RAG Studio',
    description: 'Chat with your documents. Browser-native vector search and LLM — no server.',
    icon: <BrainCircuit size={20} />,
    status: 'available',
    phase: 'Phase 3',
    href: '/tools/rag',
  },
  {
    id: 'json',
    title: 'JSON Studio',
    description: 'Format, validate, diff, query with JSONPath, and generate TypeScript types.',
    icon: <Braces size={20} />,
    status: 'available',
    phase: 'Phase 4',
    href: '/tools/json',
  },
  {
    id: 'tokens',
    title: 'Token Studio',
    description: 'Visualize how text is tokenized by GPT and local model tokenizers. Compare token counts side-by-side.',
    icon: <Cpu size={20} />,
    status: 'available',
    phase: 'Phase 4',
    href: '/tools/tokens',
  },
  {
    id: 'svg',
    title: 'SVG Studio',
    description: 'Convert PNG and JPG to SVG. Choose between ImageTracer color-region tracing and Potrace contour tracing.',
    icon: <Spline size={20} />,
    status: 'available',
    phase: 'Phase 5',
    href: '/tools/svg',
  },
  {
    id: 'crypto',
    title: 'Crypto Studio',
    description: 'JWT decode & encode, hash generator, Base64, AES cipher, HMAC, and random token generator.',
    icon: <KeyRound size={20} />,
    status: 'available',
    phase: 'Phase 7',
    href: '/tools/crypto',
  },
  {
    id: 'image',
    title: 'Image Studio',
    description: 'Convert between PNG, JPEG, WEBP, AVIF, GIF, BMP, ICO formats. Batch processing, quality control, and resize — fully client-side.',
    icon: <ImageDown size={20} />,
    status: 'available',
    phase: 'Phase 14',
    href: '/tools/image',
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
    <div className="max-w-[60rem] mx-auto py-8 px-10">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="font-sans text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03rem] text-on-surface mb-3">
          Developer Workspace
        </h1>
        <p className="text-[1.06rem] font-normal leading-[1.47] tracking-[-0.02rem] text-on-surface-muted max-w-[35rem]">
          Docs, diagrams, APIs, and utilities — all in one browser-based tool.
          <br />
          No backend, No signup. Completely free!!!
        </p>
      </div>

      {/* Section label */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-[0.69rem] font-semibold tracking-[0.08em] uppercase text-on-surface-muted">
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
        'studio-card bg-surface border border-border rounded-[1.12rem] p-6 flex flex-col gap-4 transition-[border-color,box-shadow] duration-150',
        isAvailable
          ? 'cursor-pointer hover:border-accent hover:shadow-[0_0.12rem_1rem_rgba(0,0,0,0.08)]'
          : 'cursor-default opacity-60'
      )}
    >
      {/* Icon + phase badge */}
      <div className="flex items-start justify-between">
        <div className="text-accent">{studio.icon}</div>
        <span className="text-[0.69rem] font-medium tracking-[-0.01rem] text-on-surface-muted bg-surface-raised border border-border rounded-full px-2 py-0.5">
          {isAvailable ? 'Available' : studio.phase}
        </span>
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1">
        <h3 className="text-[0.94rem] font-semibold leading-[1.24] tracking-[-0.02rem] text-on-surface">
          {studio.title}
        </h3>
        <p className="text-[0.81rem] font-normal leading-[1.43] tracking-[-0.01rem] text-on-surface-muted">
          {studio.description}
        </p>
      </div>

      {/* CTA */}
      {isAvailable && (
        <div className="mt-auto">
          <span className="text-[0.81rem] font-normal text-accent tracking-[-0.01rem]">
            Open →
          </span>
        </div>
      )}
    </div>
  )
}
