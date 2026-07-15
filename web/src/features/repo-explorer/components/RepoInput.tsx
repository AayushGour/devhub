import { useState, type FormEvent } from 'react'
import { GitBranch, Key, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import type { RepoMeta } from '../types'

interface Props {
  onFetch: (url: string, token?: string) => void
  loading: boolean
  error: string | null
  repos: RepoMeta[]
  onOpen: (repo: RepoMeta) => void
  onDelete: (repo: RepoMeta) => void
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function RepoInput({ onFetch, loading, error, repos, onOpen, onDelete }: Props) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!url.trim() || loading) return
    onFetch(url.trim(), token.trim() || undefined)
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-8">
      <div className="flex flex-col items-center gap-2">
        <GitBranch size={40} className="text-on-surface-muted" />
        <h1 className="text-xl font-semibold text-on-surface">Repo Explorer</h1>
        <p className="text-sm text-on-surface-muted text-center max-w-md">
          Paste any public GitHub repo URL to explore its dependency graph and get AI-powered code explanations.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-lg flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={loading}
            className={cn(
              'flex-1 bg-surface-raised border border-border rounded-lg px-3 py-2',
              'text-sm text-on-surface placeholder:text-on-surface-muted',
              'focus:border-accent outline-none transition-colors duration-150',
              'disabled:opacity-50',
            )}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
              'bg-accent text-accent-text hover:bg-accent-hover',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'flex items-center gap-2',
            )}
          >
            <Search size={14} />
            {loading ? 'Fetching…' : 'Explore'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowToken((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150 self-start"
        >
          <Key size={11} />
          {showToken ? 'Hide' : 'Add'} GitHub token (for rate limits / private repos)
        </button>

        {showToken && (
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx"
            className={cn(
              'bg-surface-raised border border-border rounded-lg px-3 py-2',
              'text-sm text-on-surface placeholder:text-on-surface-muted',
              'focus:border-accent outline-none transition-colors duration-150',
            )}
          />
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
        )}
      </form>

      {repos.length > 0 && (
        <div className="w-full max-w-lg flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-widest px-1">
            Indexed repositories
          </h2>
          <ul className="flex flex-col gap-1.5">
            {repos.map((r) => (
              <li key={`${r.owner}/${r.repo}`}>
                <div
                  className={cn(
                    'group flex items-center gap-3 rounded-lg border border-border bg-surface-raised',
                    'px-3 py-2 transition-colors duration-150 hover:border-accent',
                    loading && 'opacity-50 pointer-events-none',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(r)}
                    className="flex-1 min-w-0 flex flex-col items-start text-left cursor-pointer"
                  >
                    <span className="text-sm text-on-surface truncate w-full">
                      {r.owner}/{r.repo}
                    </span>
                    <span className="text-xs text-on-surface-muted truncate w-full">
                      {r.fileCount} files
                      {r.languages.length > 0 && ` · ${r.languages.slice(0, 3).join(', ')}`}
                      {` · ${timeAgo(r.fetchedAt)}`}
                    </span>
                  </button>
                  <Tooltip content="Remove from cache">
                    <button
                      type="button"
                      onClick={() => onDelete(r)}
                      aria-label={`Remove ${r.owner}/${r.repo}`}
                      className="shrink-0 text-on-surface-muted hover:text-red-400 transition-colors duration-150 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </Tooltip>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-on-surface-muted text-center">
        <p>Files are indexed locally in your browser. Nothing is sent to any server.</p>
      </div>
    </div>
  )
}
