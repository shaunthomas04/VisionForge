import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Sparkles, ArrowRight } from 'lucide-react'
import { createSession, streamRun } from '../lib/api'

const EXAMPLES = [
  'gaming mice',
  'golden retrievers',
  'espresso machines',
  'vintage bicycles',
  'mechanical keyboards',
]

export default function Home() {
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || loading) return
    setLoading(true)
    setError(null)

    try {
      const sessionId = await createSession()
      const prompt = `Build a dataset of ${query.trim()} with ${count} images`
      navigate(`/job/${encodeURIComponent(sessionId)}?q=${encodeURIComponent(prompt)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to agent')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-20">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-6">
          <Sparkles className="w-3 h-3" />
          Powered by Gemini Vision
        </div>
        <h1 className="text-4xl font-bold text-fg tracking-tight mb-3">
          Build any CV dataset
        </h1>
        <p className="text-fg-secondary text-lg">
          Describe what you want. VisionForge collects, annotates, validates,
          and exports a ready-to-train dataset in minutes.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-fg pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="gaming mice, golden retrievers, espresso machines…"
            className="w-full pl-11 pr-4 py-3.5 bg-surface border border-border rounded-xl text-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
            autoFocus
            disabled={loading}
          />
        </div>

        <div className="flex items-center gap-4 bg-surface border border-border rounded-xl px-4 py-3">
          <label className="text-sm text-muted-fg whitespace-nowrap">Target images</label>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="flex-1 accent-primary cursor-pointer"
            disabled={loading}
          />
          <span className="text-sm font-semibold text-fg w-8 text-right">{count}</span>
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error} — is <code className="text-xs bg-danger/20 px-1 rounded">adk api_server .</code> running?
          </div>
        )}

        <button
          type="submit"
          disabled={!query.trim() || loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors cursor-pointer text-sm"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Connecting…
            </>
          ) : (
            <>
              Build Dataset
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Examples */}
      <div className="mt-8">
        <p className="text-xs text-muted-fg text-center mb-3">Try an example</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setQuery(ex)}
              className="px-3 py-1.5 text-xs rounded-full border border-border bg-surface hover:bg-border text-muted-fg hover:text-fg transition-colors cursor-pointer"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
