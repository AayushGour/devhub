import type { ReactNode } from 'react'
import { Code } from './GuideCode'

// Constrained inline markup for JSON-driven guide content (data/slideDeckGuide.json):
// `code` spans and **bold** only — deliberately not a full markdown parser. Content
// authors get two markers, no escaping rules to learn, and no risk of literal backtick
// prose text being misread as a code-span delimiter (which is why the JSON content
// avoids embedding raw backtick runs like ```yaml in prose — see the JSON file's own
// rule text for how that's phrased instead).
const TOKEN_RE = /`([^`]+)`|\*\*([^*]+)\*\*/g

export function formatInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let key = 0
  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    if (match[1] !== undefined) {
      nodes.push(<Code key={key++}>{match[1]}</Code>)
    } else if (match[2] !== undefined) {
      nodes.push(<strong key={key++}>{match[2]}</strong>)
    }
    lastIndex = TOKEN_RE.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}
