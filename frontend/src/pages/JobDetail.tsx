import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useJob } from '../contexts/JobContext'
import type { ExportData } from '../contexts/JobContext'
import PipelineStatus from '../components/PipelineStatus'
import ExportPanel from '../components/ExportPanel'
import { Bot, Download } from 'lucide-react'

export default function JobDetail() {
  const { jobId }         = useParams<{ jobId: string }>()
  const [sp]              = useSearchParams()
  const { job, startJob } = useJob()
  const logRef            = useRef<HTMLDivElement>(null)

  const decodedId = jobId ? decodeURIComponent(jobId) : ''
  const prompt    = sp.get('q')     ?? ''
  const query     = sp.get('label') ?? ''

  const [fallbackExport, setFallbackExport] = useState<ExportData | null>(null)

  // Start the job if the context doesn't already have it (e.g. page refresh)
  useEffect(() => {
    if (!decodedId || !prompt) return
    if (!job || job.jobId !== decodedId) {
      startJob(decodedId, prompt, query || prompt)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedId])

  // Fallback: if pipeline finishes but exportData never arrived, poll the DB a few times.
  // The SSE stream can close before the agent finishes writing to MongoDB, so retry.
  useEffect(() => {
    if (!job?.done || job.exportData || !decodedId) return
    let cancelled = false
    async function poll(attemptsLeft: number) {
      if (cancelled || attemptsLeft <= 0) return
      try {
        const r = await fetch(`/api/datasets/${decodedId}`)
        if (r.ok) {
          const data: Record<string, unknown> = await r.json()
          if (data?.exports && typeof data.exports === 'object') {
            if (!cancelled) setFallbackExport({
              job_id:      data.job_id as string,
              exports:     data.exports as Record<string, string>,
              image_count: data.image_count as number,
              splits:      data.splits as { train: number; val: number; test: number } | undefined,
            })
            return
          }
        }
      } catch { /* ignore */ }
      // Not ready yet — retry after 3 s
      setTimeout(() => poll(attemptsLeft - 1), 3000)
    }
    poll(5)
    return () => { cancelled = true }
  }, [job?.done, job?.exportData, decodedId])

  // Auto-scroll chat log
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [job?.messages, job?.live, job?.done])

  if (!job) return null

  const { steps, messages, live, exportData, done, error } = job
  const effectiveExport = exportData ?? fallbackExport

  const TOTAL_STEPS = 5
  const runningIdx  = steps.findIndex(s => s.status === 'running')
  const stepNum     = runningIdx >= 0 ? runningIdx + 1 : steps.filter(s => s.status === 'done').length
  const ringR       = 12
  const ringCirc    = 2 * Math.PI * ringR
  const ringOffset  = ringCirc * (1 - stepNum / TOTAL_STEPS)

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ height: 'calc(100vh - 5.5rem)' }}>

        {/* ── Pipeline sidebar ─────────────────────────────────────── */}
        <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto">
          <div className="glass p-5">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-widest mb-5">Pipeline</p>
            <PipelineStatus steps={steps} />
          </div>
          {effectiveExport && (
            <ExportPanel
              jobId={effectiveExport.job_id}
              exports={effectiveExport.exports}
              imageCount={effectiveExport.image_count}
              splits={effectiveExport.splits}
            />
          )}
        </div>

        {/* ── Chat panel ───────────────────────────────────────────── */}
        <div className="lg:col-span-2 glass flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-accent-dim border border-accent/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">VisionForge Agent</p>
              <p className="text-xs text-muted-fg truncate">
                {live ? live.label + '…' : done ? 'Complete' : error ? 'Error' : 'Running pipeline…'}
              </p>
            </div>
            {!done && !error && <div className="dot-typing flex-shrink-0"><span /><span /><span /></div>}
            {done  && <span className="text-xs font-semibold text-accent flex-shrink-0">Complete</span>}
            {error && <span className="text-xs font-semibold text-danger flex-shrink-0">Error</span>}
          </div>

          {/* Messages */}
          <div ref={logRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className="animate-fade-in">

                {msg.role === 'user' && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-primary rounded-2xl rounded-tr-sm px-4 py-3 shadow-glow-sm">
                      <p className="text-sm text-white leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                )}

                {msg.role === 'agent' && (
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-xl bg-accent-dim border border-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <div className="glass-sm px-4 py-3 max-w-[82%]">
                      <p className="text-sm text-fg leading-relaxed">{msg.text}</p>
                      {msg.detail && <p className="text-xs text-muted-fg mt-1">{msg.detail}</p>}
                    </div>
                  </div>
                )}

                {msg.role === 'progress' && (
                  <div className="ml-10 flex items-start gap-2 pl-3 border-l-2 border-border">
                    <span className={`text-xs mt-0.5 flex-shrink-0 font-bold ${
                      msg.variant === 'pass' ? 'text-accent' :
                      msg.variant === 'fail' ? 'text-danger' : 'text-muted-fg'
                    }`}>›</span>
                    <p className="text-xs text-muted-fg leading-relaxed">{msg.text}</p>
                  </div>
                )}
              </div>
            ))}

            {/* Live progress bubble */}
            {live && (
              <div className="animate-fade-in flex items-start gap-3">
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 mt-0.5 relative">
                  <svg width="32" height="32" viewBox="0 0 32 32" style={{ transform: 'rotate(-90deg)', position: 'absolute', top: 0, left: 0 }}>
                    <circle cx="16" cy="16" r={ringR} stroke="rgba(99,102,241,0.2)" strokeWidth="2.5" fill="none" />
                    <circle
                      cx="16" cy="16" r={ringR}
                      stroke="rgb(99,102,241)"
                      strokeWidth="2.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={ringCirc}
                      strokeDashoffset={ringOffset}
                      style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                    />
                  </svg>
                  <span style={{ fontSize: '8px', fontWeight: 700, color: 'rgb(99,102,241)', lineHeight: 1, position: 'relative', zIndex: 1 }}>
                    {stepNum}/{TOTAL_STEPS}
                  </span>
                </div>
                <div className="glass-sm px-4 py-3 flex-1">
                  <div className="flex items-center gap-2.5">
                    <p className="text-sm text-fg">{live.label}…</p>
                    <div className="dot-typing"><span /><span /><span /></div>
                  </div>
                  {live.total > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-fg">{live.current} / {live.total}</span>
                        <span className="text-primary font-semibold">
                          {Math.round((live.current / live.total) * 100)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((live.current / live.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-danger/25 bg-danger-dim px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Download card — shown inline in chat when pipeline completes */}
            {done && effectiveExport && effectiveExport.job_id && (
              <div className="animate-fade-in ml-10 mt-1">
                <div className="glass-sm px-4 py-4">
                  <p className="text-xs font-bold text-muted-fg uppercase tracking-widest mb-3">Download Your Dataset</p>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(effectiveExport.exports)
                      .filter(([, uri]) => uri && !uri.startsWith('error'))
                      .map(([fmt]) => (
                        <a
                          key={fmt}
                          href={`/api/download/${effectiveExport.job_id}/${fmt}`}
                          download
                          className="btn-primary text-xs flex-1 justify-center"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download {fmt.toUpperCase()}
                        </a>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
