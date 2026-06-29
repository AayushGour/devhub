const CHAR_LIMIT = 8000

export async function executeFetchUrl(args: Record<string, unknown>): Promise<string> {
  const url = args.url as string
  if (!url) return '[ERROR] fetch_url: url is required'

  const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`)
  if (!res.ok) return `[ERROR] fetch_url: HTTP ${res.status} from Jina Reader`
  const text = await res.text()
  return `[Source: ${url}]\n\n${text.slice(0, CHAR_LIMIT)}`
}
