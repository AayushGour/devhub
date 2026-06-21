import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore } from '../mcp/mcpStore'

const KNOWN_SERVERS: Record<string, (port: number) => string> = {
  playwright:  (p) => `npx @modelcontextprotocol/server-playwright --port ${p}`,
  filesystem:  (p) => `npx @modelcontextprotocol/server-filesystem --port ${p} /path/to/dir`,
  sqlite:      (p) => `npx mcp-server-sqlite --port ${p} --db-path ./db.sqlite`,
  fetch:       (p) => `npx @modelcontextprotocol/server-fetch --port ${p}`,
  puppeteer:   (p) => `npx @modelcontextprotocol/server-puppeteer --port ${p}`,
}

const INPUT_CLS = 'w-full bg-surface-raised border border-border rounded-lg px-2.5 py-1.5 text-xs text-on-surface outline-none font-[inherit] focus:border-accent transition-colors duration-150'

interface Props {
  onClose: () => void
}

export default function McpSetupPanel({ onClose }: Props) {
  const [name, setName] = useState('')
  const [port, setPort] = useState('3001')
  const [copied, setCopied] = useState(false)
  const addServer = useMcpStore((s) => s.addServer)

  const nameLower = name.trim().toLowerCase()
  const portNum = parseInt(port, 10) || 3001
  const url = `http://localhost:${portNum}/mcp`

  const commandFn = KNOWN_SERVERS[nameLower]
  const command = commandFn
    ? commandFn(portNum)
    : `npx ${nameLower || '<name>'}-mcp-server --port ${portNum}`
  const isGenericCommand = !commandFn && name.trim()

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
      </div>

      {name.trim() && (
        <div className="space-y-1.5">
          <p className="text-[0.65rem] text-on-surface-muted">Run this in your terminal:</p>
          <div className="bg-surface border border-border rounded px-2.5 py-2 font-mono text-[0.65rem] text-on-surface break-all">
            {command}
          </div>
          {isGenericCommand && (
            <p className="text-[0.65rem] text-on-surface-muted">Command may differ — check your server's docs.</p>
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
