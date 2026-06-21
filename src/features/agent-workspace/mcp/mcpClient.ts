import type { ToolDefinition } from '@/lib/llm/engine'

export interface McpSession {
  sessionId: string
  serverUrl: string
}

function mcpHeaders(sessionId: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (sessionId) h['Mcp-Session-Id'] = sessionId
  return h
}

export async function initSession(serverUrl: string): Promise<McpSession> {
  const res = await fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: {
        protocolVersion: '2025-03-26',
        clientInfo: { name: 'devhub', version: '1.0' },
        capabilities: {},
      },
    }),
  })

  if (!res.ok) throw new Error(`MCP init failed: ${res.status}`)

  await res.json()
  const sessionId = res.headers.get('Mcp-Session-Id') ?? ''

  await fetch(serverUrl, {
    method: 'POST',
    headers: mcpHeaders(sessionId),
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  })

  return { sessionId, serverUrl }
}

async function readSseResult(res: Response): Promise<unknown> {
  const text = await res.text()
  const lines = text.split('\n').filter((l) => l.startsWith('data:'))
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i].slice(5).trim())
    } catch { /* keep scanning */ }
  }
  throw new Error('No parseable SSE data line found')
}

export async function listTools(session: McpSession): Promise<ToolDefinition[]> {
  const res = await fetch(session.serverUrl, {
    method: 'POST',
    headers: mcpHeaders(session.sessionId),
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2 }),
  })
  if (!res.ok) throw new Error(`MCP tools/list failed: ${res.status}`)

  let data: unknown
  const ct = res.headers.get('Content-Type') ?? ''
  if (ct.includes('text/event-stream')) {
    data = await readSseResult(res)
  } else {
    data = await res.json()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (data as any)?.result?.tools ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tools.map((t: any): ToolDefinition => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }))
}

export async function callTool(
  session: McpSession,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(session.serverUrl, {
    method: 'POST',
    headers: mcpHeaders(session.sessionId),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      id: 3,
      params: { name, arguments: args },
    }),
  })
  if (!res.ok) throw new Error(`MCP tools/call failed: ${res.status}`)

  let data: unknown
  const ct = res.headers.get('Content-Type') ?? ''
  if (ct.includes('text/event-stream')) {
    data = await readSseResult(res)
  } else {
    data = await res.json()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = (data as any)?.result?.content
  if (Array.isArray(content) && content.length > 0) {
    return content.map((c: { text?: string }) => c.text ?? '').join('\n')
  }
  return JSON.stringify(data)
}
