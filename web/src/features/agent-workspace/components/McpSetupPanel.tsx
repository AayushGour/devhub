import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore } from '../mcp/mcpStore'

// Browsers can't speak stdio, so a web app can only reach an MCP server over
// HTTP/SSE. The reference MCP servers are stdio-only, so we wrap each in
// `supergateway`, which spawns the stdio server and exposes it as SSE on a TCP
// port (served at `/sse`). The map value is the INNER stdio command; the panel
// wraps it in the gateway below. Package names/runtimes are the real ones:
// npm servers run via `npx -y`, Python servers via `uvx`.
const KNOWN_STDIO_SERVERS: Record<string, string> = {
  filesystem:         'npx -y @modelcontextprotocol/server-filesystem /path/to/dir',
  memory:             'npx -y @modelcontextprotocol/server-memory',
  everything:         'npx -y @modelcontextprotocol/server-everything',
  sequentialthinking: 'npx -y @modelcontextprotocol/server-sequential-thinking',
  playwright:         'npx -y @playwright/mcp@latest',
  fetch:              'uvx mcp-server-fetch',
  git:                'uvx mcp-server-git --repository /path/to/repo',
  sqlite:             'uvx mcp-server-sqlite --db-path ./db.sqlite',
}

// Wrap a stdio command in supergateway so it is reachable over SSE on `port`.
const bridge = (stdioCmd: string, port: number) =>
  `npx -y supergateway --stdio "${stdioCmd}" --port ${port}`

const INPUT_CLS = 'w-full bg-surface-raised border border-border rounded-lg px-2.5 py-1.5 text-xs text-on-surface outline-none font-[inherit] focus:border-accent transition-colors duration-150'

interface Props {
  onClose: () => void
}

export default function McpSetupPanel({ onClose }: Props) {
  const [name, setName] = useState('')
  const [port, setPort] = useState('3001')
  const [customUrl, setCustomUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const addServer = useMcpStore((s) => s.addServer)

  const nameLower = name.trim().toLowerCase()
  const portNum = parseInt(port, 10) || 3001
  // supergateway serves SSE at `/sse`; that's the endpoint the client connects to.
  const derivedUrl = `http://localhost:${portNum}/sse`
  const url = customUrl.trim() || derivedUrl

  const knownStdio = KNOWN_STDIO_SERVERS[nameLower]
  const command = bridge(
    knownStdio ?? 'npx -y <your-stdio-mcp-server>',
    portNum,
  )
  const isGenericCommand = !knownStdio && name.trim()

  async function handleAdd() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    await addServer(trimmedName, url)
    onClose()
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-3 border border-border rounded-lg bg-surface-raised space-y-3">
      <p className="text-xs font-medium text-on-surface">Add MCP Server</p>

      <div className="space-y-2">
        <div>
          <label className="text-[0.65rem] text-on-surface-muted">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="playwright"
            className={cn(INPUT_CLS, 'mt-0.5')}
          />
        </div>
        <div>
          <label className="text-[0.65rem] text-on-surface-muted">Port</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="3001"
            className={cn(INPUT_CLS, 'mt-0.5')}
          />
        </div>
        <div>
          <label className="text-[0.65rem] text-on-surface-muted">
            URL <span className="opacity-50">(optional — overrides port)</span>
          </label>
          <input
            type="text"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder={derivedUrl}
            className={cn(INPUT_CLS, 'mt-0.5')}
          />
        </div>
      </div>

      {name.trim() && (
        <div className="space-y-1.5">
          <p className="text-[0.65rem] text-on-surface-muted">
            Run this in your terminal — it bridges a stdio MCP server to SSE so the browser can connect:
          </p>
          <div className="bg-surface border border-border rounded px-2.5 py-2 font-mono text-[0.65rem] text-on-surface break-all">
            {command}
          </div>
          {isGenericCommand && (
            <p className="text-[0.65rem] text-on-surface-muted">
              Replace <span className="font-mono">&lt;your-stdio-mcp-server&gt;</span> with the command that starts your MCP server.
            </p>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[0.65rem] text-accent hover:opacity-80 transition-opacity"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Copied!' : 'Copy command'}
          </button>
        </div>
      )}

      <p className="text-[0.65rem] text-on-surface-muted">
        ⟳ Will connect automatically when server is ready.
      </p>

      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          disabled={!name.trim()}
          className={cn(
            'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150',
            name.trim()
              ? 'bg-accent text-accent-text hover:bg-accent-hover'
              : 'bg-surface text-on-surface-muted cursor-not-allowed',
          )}
        >
          Add &amp; Connect
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-xs text-on-surface-muted hover:bg-surface-hover transition-colors duration-150"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
