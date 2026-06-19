import { useState, type FormEvent } from 'react'
import { Github, Key, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onFetch: (url: string, token?: string) => void
  loading: boolean
  error: string | null
}

export default function RepoInput({ onFetch, loading, error }: Props) {
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
        <Github size={40} className="text-on-surface-muted" />
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

      <div className="text-xs text-on-surface-muted text-center">
        <p>Files are indexed locally in your browser. Nothing is sent to any server.</p>
      </div>
    </div>
  )
}
