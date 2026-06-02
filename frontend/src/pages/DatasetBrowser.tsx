import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, Database, PackageOpen, LayoutGrid, Calendar, Tag, RefreshCw, Search, X, Sparkles } from 'lucide-react'

interface Dataset {
  job_id: string
  query?: string
  version?: number
  image_count?: number
  class_counts?: Record<string, number>
  splits?: { train: number; val: number; test: number }
  exports?: Record<string, string>
  created_at?: string
}

function fmtDate(d?: string) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return String(d)
  }
}

// ── Top-level page ─────────────────────────────────────────────────────────

export default function DatasetBrowser() {
  const [datasets, setDatasets]       = useState<Dataset[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [selected, setSelected]       = useState<Dataset | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Dataset[] | null>(null)
  const [searching, setSearching]     = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function load() {
    setLoading(true)
    setError(null)
    fetch('/api/datasets')
      .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.json() })
      .then(data => { setDatasets(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    setSearchError(null)
    fetch(`/api/search-datasets?q=${encodeURIComponent(q)}`)
      .then(r => { if (!r.ok) throw new Error(`Search error ${r.status}`); return r.json() })
      .then(data => { setSearchResults(Array.isArray(data) ? data : []); setSearching(false) })
      .catch(e => { setSearchError(e.message); setSearching(false) })
  }

  function clearSearch() {
    setSearchQuery('')
    setSearchResults(null)
    setSearchError(null)
    inputRef.current?.focus()
  }

  if (selected) {
    return <DatasetDetail dataset={selected} onBack={() => setSelected(null)} />
  }

  const displayed  = searchResults ?? datasets
  const isFiltered = searchResults !== null

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-fg tracking-tight">Datasets</h1>
          <p className="text-muted-fg text-sm mt-1">Previously built datasets stored in MongoDB Atlas</p>
        </div>
        <div className="flex items-center gap-3">
          {!isFiltered && datasets.length > 0 && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent-dim border border-accent/20 text-accent">
              {datasets.length} dataset{datasets.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="btn-ghost flex items-center gap-1.5 text-xs"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="relative mb-6">
        <div className="relative flex items-center">
          {searching
            ? <span className="absolute left-4 w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
            : <Search className="absolute left-4 w-4 h-4 text-muted-fg pointer-events-none" />
          }
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search datasets with AI — try 'dogs' or 'traffic'"
            className="w-full pl-11 pr-24 py-3 rounded-xl bg-surface-2 border border-border text-fg placeholder:text-muted-fg
                       focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50
                       transition-all duration-200 text-sm"
          />
          <div className="absolute right-3 flex items-center gap-2">
            {searchQuery && (
              <button type="button" onClick={clearSearch}
                className="w-6 h-6 rounded-full flex items-center justify-center text-muted-fg hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button type="submit" disabled={!searchQuery.trim() || searching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30
                         text-primary text-xs font-semibold hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              <Sparkles className="w-3 h-3" />
              Search
            </button>
          </div>
        </div>
      </form>

      {/* Search result header */}
      {isFiltered && !searching && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-fg">
            <span className="text-fg font-semibold">{searchResults!.length}</span>
            {' '}result{searchResults!.length !== 1 ? 's' : ''} for{' '}
            <span className="text-primary font-semibold">"{searchQuery}"</span>
          </p>
          <button onClick={clearSearch}
            className="flex items-center gap-1.5 text-xs text-muted-fg hover:text-fg transition-colors cursor-pointer">
            <X className="w-3 h-3" />
            Clear search
          </button>
        </div>
      )}

      {/* States */}
      {loading && !isFiltered && <LoadingSkeleton />}
      {searching && <LoadingSkeleton />}

      {error && !loading && !isFiltered && (
        <div className="glass p-8 text-center">
          <p className="text-danger text-sm mb-1">Failed to load datasets: {error}</p>
          <p className="text-muted-fg text-xs">Make sure the backend is running with <code className="bg-surface-2 border border-border px-1.5 py-0.5 rounded">uvicorn main:app --port 8000</code></p>
        </div>
      )}

      {searchError && (
        <div className="glass p-6 text-center">
          <p className="text-danger text-sm">Search failed: {searchError}</p>
        </div>
      )}

      {!loading && !searching && !error && !searchError && displayed.length === 0 && (
        isFiltered ? (
          <div className="glass p-12 text-center">
            <div className="w-10 h-10 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
              <Search className="w-5 h-5 text-muted-fg" />
            </div>
            <p className="text-sm font-semibold text-fg mb-1">No matching datasets</p>
            <p className="text-xs text-muted-fg">Try a different search term or <button onClick={clearSearch} className="text-primary underline cursor-pointer">view all datasets</button>.</p>
          </div>
        ) : <EmptyState />
      )}

      {!loading && !searching && !error && !searchError && displayed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map(ds => (
            <DatasetCard key={ds.job_id} dataset={ds} onClick={() => setSelected(ds)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Dataset card ───────────────────────────────────────────────────────────

function DatasetCard({ dataset: ds, onClick }: { dataset: Dataset; onClick: () => void }) {
  const classes = Object.keys(ds.class_counts ?? {})
  const topClasses = classes.slice(0, 3)
  const overflow = classes.length - topClasses.length

  return (
    <button
      onClick={onClick}
      className="glass p-5 text-left w-full hover:border-primary/40 transition-all duration-200 group cursor-pointer"
      style={{ '--tw-shadow': '0 0 0 0 transparent' } as React.CSSProperties}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-fg leading-snug capitalize group-hover:text-primary transition-colors"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {ds.query ?? 'Unnamed dataset'}
        </h3>
        <span className="text-xs font-medium text-accent bg-accent-dim px-2 py-0.5 rounded-full border border-accent/15 flex-shrink-0 whitespace-nowrap">
          v{ds.version ?? 1}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-fg">
          <LayoutGrid className="w-3 h-3" />
          {ds.image_count ?? 0} images
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-fg">
          <Calendar className="w-3 h-3" />
          {fmtDate(ds.created_at)}
        </span>
      </div>

      {/* Class tags */}
      {topClasses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topClasses.map(cls => (
            <span key={cls}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted-fg">
              <Tag className="w-2.5 h-2.5" />
              {cls}
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted-fg">
              +{overflow} more
            </span>
          )}
        </div>
      )}
    </button>
  )
}

// ── Dataset detail view ────────────────────────────────────────────────────

function DatasetDetail({ dataset: ds, onBack }: { dataset: Dataset; onBack: () => void }) {
  const classes  = Object.entries(ds.class_counts ?? {})
  const maxCount = Math.max(...classes.map(([, n]) => n), 1)
  const splits   = ds.splits
  const total    = splits ? splits.train + splits.val + splits.test : 0
  const exports  = Object.entries(ds.exports ?? {}).filter(([, uri]) => uri && !uri.startsWith('error'))

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-fg hover:text-fg transition-colors mb-6 cursor-pointer group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        All datasets
      </button>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-fg tracking-tight capitalize">
            {ds.query ?? 'Unnamed dataset'}
          </h1>
          <p className="text-muted-fg text-sm mt-1">
            v{ds.version ?? 1} · {ds.image_count ?? 0} images · {fmtDate(ds.created_at)}
          </p>
        </div>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent-dim border border-accent/20 text-accent flex-shrink-0">
          Complete
        </span>
      </div>

      <div className="space-y-4">

        {/* Classes */}
        {classes.length > 0 && (
          <div className="glass p-5">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-widest mb-4">Classes</p>
            <div className="space-y-3">
              {classes.map(([cls, count]) => (
                <div key={cls}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-fg font-medium">{cls}</span>
                    <span className="text-muted-fg tabular-nums">{count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Splits */}
        {splits && total > 0 && (
          <div className="glass p-5">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-widest mb-4">Dataset Splits</p>

            {/* Stacked bar */}
            <div className="flex h-2.5 rounded-full overflow-hidden mb-4 gap-px">
              <div className="bg-primary transition-all" style={{ width: `${(splits.train / total) * 100}%` }} />
              <div className="bg-accent  transition-all" style={{ width: `${(splits.val   / total) * 100}%` }} />
              <div className="bg-muted   transition-all" style={{ width: `${(splits.test  / total) * 100}%` }} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Train', value: splits.train, color: 'text-primary', bg: 'bg-primary-dim', glow: 'shadow-[0_0_8px_rgba(99,102,241,0.2)]' },
                { label: 'Val',   value: splits.val,   color: 'text-accent',  bg: 'bg-accent-dim',  glow: 'shadow-[0_0_8px_rgba(34,197,94,0.15)]' },
                { label: 'Test',  value: splits.test,  color: 'text-muted-fg', bg: 'bg-surface-2', glow: '' },
              ].map(({ label, value, color, bg, glow }) => (
                <div key={label} className={`${bg} ${glow} border border-border rounded-xl p-3 text-center`}>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-fg mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Download */}
        {exports.length > 0 && (
          <div className="glass p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-accent-dim flex items-center justify-center">
                <PackageOpen className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-xs font-bold text-muted-fg uppercase tracking-widest">Download</p>
            </div>
            <div className="flex gap-3">
              {exports.map(([fmt]) => (
                <a
                  key={fmt}
                  href={`/api/download/${ds.job_id}/${fmt}`}
                  download
                  className="btn-primary flex-1 justify-center"
                >
                  <Download className="w-4 h-4" />
                  Download {fmt.toUpperCase()}
                </a>
              ))}
            </div>
          </div>
        )}

        {exports.length === 0 && (
          <div className="glass p-6 text-center">
            <p className="text-sm text-muted-fg">No export archives available for this dataset.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Skeleton loader ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass p-5 space-y-3 animate-pulse">
          <div className="h-4 bg-surface-2 rounded-lg w-3/4" />
          <div className="h-3 bg-surface-2 rounded-lg w-1/2" />
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-surface-2 rounded-full" />
            <div className="h-5 w-16 bg-surface-2 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="glass p-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
        <Database className="w-6 h-6 text-muted-fg" />
      </div>
      <h3 className="font-semibold text-fg mb-1">No datasets yet</h3>
      <p className="text-sm text-muted-fg max-w-sm mx-auto leading-relaxed">
        Build your first dataset on the home page. Completed datasets will appear here automatically.
      </p>
    </div>
  )
}
