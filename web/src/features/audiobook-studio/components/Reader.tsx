import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { ReadableChapter } from '../utils/bookSource'
import type { Block, SentenceSpan } from '../types'
import type { WordSpan } from '../utils/timeline'

interface Props {
  chapter: ReadableChapter
  activeSentenceId: string | null
  wordRange: WordSpan | null
  autoFollow: boolean
  fontSizeRem: number
  onSeekToSentence: (sentenceId: string) => void
}

/** Block type -> element. 'list' never reaches here; it is wrapped in a <ul>. */
const BLOCK_TAG: Record<Block['type'], 'h1' | 'h2' | 'h3' | 'p' | 'blockquote' | 'li'> = {
  h1: 'h1', h2: 'h2', h3: 'h3', p: 'p', quote: 'blockquote', list: 'li',
}

const BLOCK_CLASS: Record<Block['type'], string> = {
  h1: 'text-2xl font-semibold mt-10 mb-4 first:mt-0',
  h2: 'text-xl font-semibold mt-8 mb-3',
  h3: 'text-lg font-semibold mt-6 mb-2',
  p: 'mb-5',
  quote: 'mb-5 pl-4 border-l-2 border-border italic',
  list: 'mb-2',
}

export default function Reader({
  chapter,
  activeSentenceId,
  wordRange,
  autoFollow,
  fontSizeRem,
  onSeekToSentence,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLSpanElement | null>(null)

  const sentencesByBlock = useMemo(() => {
    const map = new Map<number, SentenceSpan[]>()
    for (const sentence of chapter.sentences) {
      const list = map.get(sentence.blockIdx)
      if (list) list.push(sentence)
      else map.set(sentence.blockIdx, [sentence])
    }
    return map
  }, [chapter])

  // List items must sit inside a list element. Runs of them are gathered here
  // rather than each being emitted as a stray <li>, which is invalid markup and
  // renders without its marker.
  const groups = useMemo(() => {
    const out: { list: boolean; blocks: { block: Block; blockIdx: number }[] }[] = []
    chapter.blocks.forEach((block, blockIdx) => {
      const list = block.type === 'list'
      const tail = out[out.length - 1]
      if (tail && tail.list === list) tail.blocks.push({ block, blockIdx })
      else out.push({ list, blocks: [{ block, blockIdx }] })
    })
    return out
  }, [chapter])

  const renderBlock = (block: Block, blockIdx: number) => {
    const spans = sentencesByBlock.get(blockIdx) ?? []
    if (spans.length === 0) return block.text
    return spans.map((span) => (
      <Sentence
        key={span.id}
        span={span}
        active={span.id === activeSentenceId}
        wordRange={span.id === activeSentenceId ? wordRange : null}
        activeRef={span.id === activeSentenceId ? activeRef : undefined}
        onSeek={onSeekToSentence}
      />
    ))
  }

  // Keep the spoken line in view. `nearest` rather than `center` so short jumps
  // within a visible paragraph do not yank the page around.
  useEffect(() => {
    if (!autoFollow || !activeSentenceId) return
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeSentenceId, autoFollow])

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
      <article
        className="max-w-[42rem] mx-auto text-on-surface leading-[1.75]"
        // Reader-controlled type size — a runtime value, not a fixed utility.
        style={{ fontSize: `${fontSizeRem}rem` }}
      >
        {groups.map((group, groupIdx) =>
          group.list ? (
            <ul key={groupIdx} className="mb-5 list-disc pl-6">
              {group.blocks.map(({ block, blockIdx }) => (
                <li key={blockIdx} className={BLOCK_CLASS[block.type]}>
                  {renderBlock(block, blockIdx)}
                </li>
              ))}
            </ul>
          ) : (
            group.blocks.map(({ block, blockIdx }) => {
              const Tag = BLOCK_TAG[block.type]
              return (
                <Tag key={blockIdx} className={BLOCK_CLASS[block.type]}>
                  {renderBlock(block, blockIdx)}
                </Tag>
              )
            })
          ),
        )}
      </article>
    </div>
  )
}

interface SentenceProps {
  span: SentenceSpan
  active: boolean
  wordRange: WordSpan | null
  activeRef?: React.RefObject<HTMLSpanElement | null>
  onSeek: (sentenceId: string) => void
}

function Sentence({ span, active, wordRange, activeRef, onSeek }: SentenceProps) {
  const body =
    active && wordRange ? (
      <>
        {span.text.slice(0, wordRange.start)}
        <mark className="bg-accent text-accent-text rounded-[0.15rem] px-px">
          {span.text.slice(wordRange.start, wordRange.end)}
        </mark>
        {span.text.slice(wordRange.end)}
      </>
    ) : (
      span.text
    )

  return (
    <>
      <span
        ref={activeRef}
        role="button"
        tabIndex={0}
        title="Play from here"
        onClick={() => onSeek(span.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSeek(span.id) }}
        className={cn(
          'cursor-pointer rounded-[0.15rem] transition-colors duration-150',
          active ? 'bg-accent/20' : 'hover:bg-surface-hover',
        )}
      >
        {body}
      </span>{' '}
    </>
  )
}
