import { useCallback, useRef, useState } from 'react'
import { getEngine, streamComplete } from '@/lib/llm/engine'
import { getModelById, formatVram } from '@/lib/llm/models'
import { saveWikiPage, loadWikiPage } from '../utils/repoDb'
import { useSettingsStore } from '@/store/settingsStore'
import { useIndexingStore } from '@/store/indexingStore'
import type { WikiPage, RepoFile } from '../types'

function wikiMessages(file: RepoFile): { role: 'system' | 'user'; content: string }[] {
  const snippet = file.content.slice(0, 4000)
  return [
    {
      role: 'system',
      content:
        'You are a technical documentation writer. Output ONLY markdown. No thinking, no preamble, no meta-commentary. Begin your response immediately with "## Summary".',
    },
    {
      role: 'user',
      content: `Document this source file as a wiki page.

File: ${file.path}
Language: ${file.language}

\`\`\`
${snippet}
\`\`\`

Use exactly these four sections in order:

## Summary
What this file does and its role in the codebase (2-3 sentences).

## Key Exports / Functions / Components
Bullet list — each item is an exported function, class, component, or constant with a one-line description of what it does.

## Dependencies
Bullet list of everything this file imports, grouped as internal (relative imports) and external (packages).

## Usage Notes
Patterns, caveats, or things a developer working with this file should know.

Start with ## Summary now.`,
    },
  ]
}

// Strip <think>…</think> blocks (Qwen/DeepSeek style) and any text before ## Summary.
// Also detect and cut off repetition loops.
function cleanOutput(raw: string): string {
  let text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?(##\s+Summary)/i, '$1')
    .trim()

  // Repetition guard: if any non-blank line appears >3 times, truncate there
  const lines = text.split('\n')
  const counts = new Map<string, number>()
  const out: string[] = []
  for (const line of lines) {
    const key = line.trim()
    if (key) {
      const n = (counts.get(key) ?? 0) + 1
      counts.set(key, n)
      if (n > 3) break
    }
    out.push(line)
  }

  return out.join('\n').trim()
}

export function useWikiGen() {
  const [wikiPages, setWikiPages] = useState<Map<string, WikiPage>>(new Map())
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const ragLlmModel = useSettingsStore((s) => s.ragLlmModel)
  const indexingStart = useIndexingStore((s) => s.start)
  const indexingSetProgress = useIndexingStore((s) => s.setProgress)
  const indexingFinish = useIndexingStore((s) => s.finish)
  const indexingSetError = useIndexingStore((s) => s.setError)

  // Refs so generateWiki guard checks don't need wikiPages/generating as deps,
  // preventing callback recreation on every streaming chunk.
  const wikiPagesRef = useRef(wikiPages)
  wikiPagesRef.current = wikiPages
  const generatingRef = useRef(generating)
  generatingRef.current = generating

  const generateWiki = useCallback(async (
    owner: string,
    repo: string,
    file: RepoFile,
  ): Promise<WikiPage | null> => {
    if (wikiPagesRef.current.has(file.path)) return wikiPagesRef.current.get(file.path)!

    const dbCached = await loadWikiPage(owner, repo, file.path)
    if (dbCached) {
      setWikiPages((prev) => new Map(prev).set(file.path, dbCached))
      return dbCached
    }

    if (generatingRef.current.has(file.path)) return null

    setGenerating((prev) => new Set(prev).add(file.path))

    // Boot the LLM with progress feedback (no-op if already loaded)
    const modelEntry = getModelById(ragLlmModel)
    const sizeHint = modelEntry ? ` (~${formatVram(modelEntry.vramMB)})` : ''
    indexingStart(`Loading ${modelEntry?.label ?? 'LLM'}${sizeHint}`, () => {})
    try {
      await getEngine(ragLlmModel, (pct) => indexingSetProgress(pct, 100))
      indexingFinish()
    } catch {
      indexingSetError('Failed to load LLM. Check network & refresh.')
      setGenerating((prev) => { const n = new Set(prev); n.delete(file.path); return n })
      return null
    }

    let accumulated = ''
    try {
      for await (const delta of streamComplete(
        ragLlmModel,
        wikiMessages(file),
        { max_tokens: 1024 },
      )) {
        accumulated += delta
        const partial = cleanOutput(accumulated)

        // Live update so the viewer shows content as it streams in
        setWikiPages((prev) =>
          new Map(prev).set(file.path, {
            path: file.path,
            content: partial || accumulated,
            generatedAt: Date.now(),
          }),
        )
      }

      const final = cleanOutput(accumulated) || accumulated.trim()
      const page: WikiPage = { path: file.path, content: final, generatedAt: Date.now() }
      await saveWikiPage(owner, repo, page)
      setWikiPages((prev) => new Map(prev).set(file.path, page))
      return page
    } catch {
      return null
    } finally {
      setGenerating((prev) => {
        const next = new Set(prev)
        next.delete(file.path)
        return next
      })
    }
  }, [ragLlmModel, indexingStart, indexingSetProgress, indexingFinish, indexingSetError])

  return { generateWiki, wikiPages, generating }
}
