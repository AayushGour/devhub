import { useCallback, useState } from 'react'
import { complete } from '@/features/rag-studio/utils/llm'
import { saveWikiPage, loadWikiPage } from '../utils/repoDb'
import { useSettingsStore } from '@/store/settingsStore'
import type { WikiPage, RepoFile } from '../types'

function wikiPrompt(file: RepoFile): string {
  const snippet = file.content.slice(0, 3000)
  return `You are a code documentation assistant. Analyze the following source file and produce a wiki page in markdown.

File: ${file.path}
Language: ${file.language}

\`\`\`
${snippet}
\`\`\`

Write a wiki page with these sections (use markdown headers):
## Summary
(2-3 sentences: what this file does, its role in the codebase)

## Key Exports / Functions / Classes
(bullet list of the most important exports, classes, or functions with 1-line descriptions each)

## Dependencies
(bullet list of what this file imports from, internal and external)

## Usage Notes
(any important patterns, caveats, or things a developer should know)

RETURN ONLY MARKDOWN. No preamble.`
}

export function useWikiGen() {
  const [wikiPages, setWikiPages] = useState<Map<string, WikiPage>>(new Map())
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const ragLlmModel = useSettingsStore((s) => s.ragLlmModel)

  const generateWiki = useCallback(async (
    owner: string,
    repo: string,
    file: RepoFile,
  ): Promise<WikiPage | null> => {
    // Check cache
    const cached = wikiPages.get(file.path)
    if (cached) return cached

    const dbCached = await loadWikiPage(owner, repo, file.path)
    if (dbCached) {
      setWikiPages((prev) => new Map(prev).set(file.path, dbCached))
      return dbCached
    }

    if (generating.has(file.path)) return null

    setGenerating((prev) => new Set(prev).add(file.path))
    try {
      const content = await complete(ragLlmModel, [
        { role: 'user', content: wikiPrompt(file) },
      ], { max_tokens: 1024 })

      const page: WikiPage = {
        path: file.path,
        content,
        generatedAt: Date.now(),
      }

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
  }, [wikiPages, generating, ragLlmModel])

  return { generateWiki, wikiPages, generating }
}
