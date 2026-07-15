interface WikiSearchHit {
  title: string
  snippet: string
  pageid: number
}

interface HNHit {
  title: string
  url: string | null
  objectID: string
}

export async function executeWebSearch(args: Record<string, unknown>): Promise<string> {
  const query = args.query as string
  if (!query) return '[ERROR] web_search: query is required'

  const encoded = encodeURIComponent(query)

  const [wikiRes, hnRes] = await Promise.allSettled([
    fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&format=json&origin=*&srlimit=5`,
    ).then((r) => r.json()),
    fetch(
      `https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=5`,
    ).then((r) => r.json()),
  ])

  const lines: string[] = [`Search results for: "${query}"\n`]

  if (wikiRes.status === 'fulfilled') {
    const hits: WikiSearchHit[] = wikiRes.value?.query?.search ?? []
    if (hits.length > 0) {
      lines.push('**Wikipedia**')
      hits.forEach((h, i) => {
        const snippet = h.snippet.replace(/<[^>]+>/g, '')
        lines.push(`${i + 1}. [${h.title}](https://en.wikipedia.org/?curid=${h.pageid})\n   ${snippet}`)
      })
    }
  }

  if (hnRes.status === 'fulfilled') {
    const hits: HNHit[] = hnRes.value?.hits ?? []
    if (hits.length > 0) {
      lines.push('\n**HackerNews**')
      hits.forEach((h, i) => {
        const url = h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`
        lines.push(`${i + 1}. [${h.title}](${url})`)
      })
    }
  }

  return lines.join('\n') || '[ERROR] web_search: no results found'
}
