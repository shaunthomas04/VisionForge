import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles, Image, ShieldCheck, PackageOpen, HelpCircle } from 'lucide-react'
import { createSession } from '../lib/api'
import HelpModal from '../components/HelpModal'

const EXAMPLES = ['gaming mice', 'golden retrievers', 'espresso machines', 'vintage bicycles', 'rubber ducks']

const FEATURES = [
  { icon: Image,       color: 'text-blue-400',   bg: 'bg-blue-400/10',   label: 'Auto image collection' },
  { icon: Sparkles,    color: 'text-purple-400',  bg: 'bg-purple-400/10', label: 'Gemini Vision annotation' },
  { icon: ShieldCheck, color: 'text-green-400',   bg: 'bg-green-400/10',  label: 'Two-pass validation' },
  { icon: PackageOpen, color: 'text-accent',      bg: 'bg-accent-dim',    label: 'YOLO & COCO export' },
]

export default function Home() {
  const [query, setQuery]   = useState('')
  const [count, setCount]   = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
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
    <>
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-4 py-16">
        {/* Badge */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/25 bg-primary-dim text-primary text-xs font-semibold mb-8 animate-fade-in">
          <Sparkles className="w-3.5 h-3.5" />
          Powered by Gemini Vision · Google Cloud
        </div>

        {/* Headline */}
        <h1 className="text-5xl font-extrabold text-center tracking-tight mb-4 pb-2 animate-fade-in"
            style={{ background: 'linear-gradient(135deg, #F0F0FF 30%, #A78BFA 70%, #6366F1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Build any CV dataset
        </h1>
        <p className="text-fg-2 text-lg text-center max-w-md mb-10 animate-fade-in leading-relaxed">
          Describe what you want in plain English. VisionForge handles the rest — collection, annotation, validation, and export.
        </p>

        {/* Features row */}
        <div className="flex flex-wrap justify-center gap-2 mb-10 animate-fade-in">
          {FEATURES.map(({ icon: Icon, color, bg, label }) => (
            <div key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${bg} border border-white/5 text-xs font-medium ${color}`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </div>
          ))}
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="glass w-full max-w-xl p-6 space-y-4 animate-fade-in">
          {/* Query input */}
          <div>
            <label className="block text-xs font-semibold text-muted-fg mb-2 uppercase tracking-wider">
              What do you want to detect?
            </label>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. gaming mice, golden retrievers…"
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border text-fg placeholder:text-muted-fg
                         focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50
                         transition-all duration-200 text-sm"
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Count slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-fg uppercase tracking-wider">Target images</label>
              <span className="text-sm font-bold text-primary">{count}</span>
            </div>
            <input
              type="range" min={5} max={100} step={5} value={count}
              onChange={e => setCount(Number(e.target.value))}
              className="w-full accent-primary cursor-pointer"
              disabled={loading}
            />
            <div className="flex justify-between text-xs text-muted-fg mt-1">
              <span>5 · quick test</span>
              <span>100 · full dataset</span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-danger/30 bg-danger-dim px-4 py-3 text-sm text-danger leading-relaxed">
              {error}
              <span className="block text-xs mt-1 text-danger/70">
                Make sure <code className="bg-danger/10 px-1 rounded">adk api_server . --allow_origins http://localhost:5173</code> is running.
              </span>
            </div>
          )}

          <button type="submit" disabled={!query.trim() || loading} className="btn-primary w-full justify-center text-sm">
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connecting to agent…
              </>
            ) : (
              <>Build Dataset <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        {/* Examples + help */}
        <div className="mt-6 text-center animate-fade-in">
          <p className="text-xs text-muted-fg mb-3">Try an example</p>
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => setQuery(ex)}
                className="px-3 py-1.5 text-xs rounded-full border border-border bg-surface-2 hover:bg-muted/40 hover:border-border-bright text-muted-fg hover:text-fg transition-all duration-150 cursor-pointer">
                {ex}
              </button>
            ))}
          </div>
          <button onClick={() => setShowHelp(true)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-fg hover:text-primary transition-colors cursor-pointer">
            <HelpCircle className="w-3.5 h-3.5" />
            How does VisionForge work?
          </button>
        </div>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  )
}
