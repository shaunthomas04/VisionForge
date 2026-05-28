import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { streamRun, type AgentEvent } from '../lib/api'
import PipelineStatus, { type PipelineStep } from '../components/PipelineStatus'
import ExportPanel from '../components/ExportPanel'
import { Bot } from 'lucide-react'

interface Message {
  role: 'user' | 'agent' | 'progress'
  text: string
  detail?: string
  variant?: 'pass' | 'fail' | 'neutral'
}

interface LiveProgress {
  label: string
  current: number
  total: number
}

interface ExportData {
  exports: Record<string, string>
  image_count: number
  splits?: { train: number; val: number; test: number }
}

const INIT_STEPS: PipelineStep[] = [
  { id: 'search',      label: 'Image Collection',     status: 'pending' },
  { id: 'annotate',    label: 'Gemini Annotation',    status: 'pending' },
  { id: 'validate',    label: 'Validation',           status: 'pending' },
  { id: 'deduplicate', label: 'Deduplication',        status: 'pending' },
  { id: 'export',      label: 'Export (YOLO / COCO)', status: 'pending' },
]

const TOOL_STEP: Record<string, number> = {
  search_images: 0, annotate_image: 1,
  validate_annotation: 2, deduplicate: 3, export_dataset: 4,
}

export default function JobDetail() {
  const { jobId }   = useParams<{ jobId: string }>()
  const [sp]        = useSearchParams()
  const prompt      = sp.get('q') ?? ''

  const [messages, setMessages]     = useState<Message[]>([{ role: 'user', text: prompt }])
  const [steps, setSteps]           = useState<PipelineStep[]>(INIT_STEPS.map(s => ({ ...s })))
  const [live, setLive]             = useState<LiveProgress | null>(null)
  const [exportData, setExportData] = useState<ExportData | null>(null)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const logRef                      = useRef<HTMLDivElement>(null)

  // mutable counters — no renders
  const started        = useRef(false)
  const totalImages    = useRef(0)
  const annotateIdx    = useRef(0)
  const validateIdx    = useRef(0)
  const validatePassed = useRef(0)
  const pendingText    = useRef('')

  // schedule queue: spreads rapid batched events 100ms apart visually
  const nextUpdateAt = useRef(0)

  function scheduleUpdate(fn: () => void) {
    const now  = Date.now()
    const when = Math.max(now + 10, nextUpdateAt.current)
    nextUpdateAt.current = when + 100
    setTimeout(fn, when - now)
  }

  const pushMsg  = (text: string, detail?: string, variant?: Message['variant']) =>
    setMessages(p => [...p, { role: 'agent', text, detail, variant }])
  const pushProg = (text: string, variant?: Message['variant']) =>
    setMessages(p => [...p, { role: 'progress', text, variant }])

  function flushPendingText() {
    const t = pendingText.current.trim()
    if (t) {
      scheduleUpdate(() => pushMsg(t))
      pendingText.current = ''
    }
  }

  function markStep(idx: number, status: PipelineStep['status'], detail?: string) {
    setSteps(p => p.map((s, i) => i === idx ? { ...s, status, detail } : s))
  }

  function transitionTo(idx: number) {
    setSteps(p => p.map((s, i) => {
      if (i < idx && (s.status === 'running' || s.status === 'pending')) return { ...s, status: 'done' }
      if (i === idx) return { ...s, status: 'running' }
      return s
    }))
  }

  function handleEvent(ev: AgentEvent) {
    // flush accumulated text on turn_complete
    const tc = (ev as Record<string, unknown>)
    if (tc.turn_complete || (tc.actions as Record<string, unknown>)?.turn_complete) {
      flushPendingText()
      return
    }

    for (const part of ev.content?.parts ?? []) {

      // ── TOOL CALLS ────────────────────────────────────────────────────────
      if (part.function_call) {
        flushPendingText()
        const { name, args = {} } = part.function_call

        if (name === 'search_images') {
          scheduleUpdate(() => {
            transitionTo(0)
            setLive({ label: 'Collecting images from Unsplash', current: 0, total: 0 })
          })

        } else if (name === 'annotate_image') {
          annotateIdx.current++
          const cur = annotateIdx.current
          const tot = totalImages.current
          scheduleUpdate(() => {
            if (cur === 1) transitionTo(1)
            setLive({ label: 'Annotating with Gemini Vision', current: cur, total: tot })
          })

        } else if (name === 'validate_annotation') {
          validateIdx.current++
          const cur = validateIdx.current
          const tot = annotateIdx.current
          scheduleUpdate(() => {
            if (cur === 1) transitionTo(2)
            setLive({ label: 'Validating annotations', current: cur, total: tot })
          })

        } else if (name === 'deduplicate') {
          const n = totalImages.current
          scheduleUpdate(() => {
            transitionTo(3)
            setLive({ label: 'Scanning for near-duplicates', current: 0, total: 0 })
            pushMsg(`Scanning ${n} images for near-duplicates…`)
          })

        } else if (name === 'export_dataset') {
          scheduleUpdate(() => {
            transitionTo(4)
            setLive({ label: 'Generating YOLO & COCO archives', current: 0, total: 0 })
            pushMsg('Building YOLO and COCO zip archives…')
          })
        }
        void args
      }

      // ── TOOL RESPONSES ────────────────────────────────────────────────────
      if (part.function_response) {
        const { name, response: resp } = part.function_response
        const r   = resp as Record<string, unknown>
        const idx = TOOL_STEP[name]
        const err = r.status === 'error'

        if (name === 'search_images') {
          if (err) {
            scheduleUpdate(() => { setLive(null); markStep(idx, 'error'); pushMsg(`Search failed: ${r.message}`) })
          } else {
            const collected = r.collected as number
            totalImages.current = collected
            scheduleUpdate(() => {
              setLive(null)
              markStep(idx, 'done', `${collected} collected`)
              pushMsg(
                `Found ${collected} images and uploaded them to GCS.`,
                'Starting Gemini Vision annotation on each one…'
              )
            })
          }

        } else if (name === 'annotate_image') {
          const anns = (r.annotations as Array<Record<string, unknown>>) ?? []
          if (anns.length > 0) {
            const labels = anns.map(a =>
              `${a.class_name} · ${Math.round((a.confidence as number) * 100)}%`
            ).join('  ·  ')
            scheduleUpdate(() => pushProg(`→ ${labels}`, 'pass'))
          } else {
            scheduleUpdate(() => pushProg('→ No object detected, skipping', 'neutral'))
          }
          if (annotateIdx.current >= totalImages.current && totalImages.current > 0) {
            const total = totalImages.current
            scheduleUpdate(() => {
              setLive(null)
              markStep(idx, 'done', `${total} annotated`)
              pushMsg(`All ${total} images annotated. Running validation…`)
            })
          }

        } else if (name === 'validate_annotation') {
          const passed = r.passed as boolean
          if (passed) {
            validatePassed.current++
            const conf = Math.round((r.confidence as number) * 100)
            scheduleUpdate(() => pushProg(`→ Confirmed  ${conf}% confidence`, 'pass'))
          } else {
            const reason = (r.rejection_reason as string) ?? 'low confidence'
            scheduleUpdate(() => pushProg(`→ Rejected: ${reason}`, 'fail'))
          }
          if (validateIdx.current >= annotateIdx.current && annotateIdx.current > 0) {
            const vp = validatePassed.current, vi = validateIdx.current
            scheduleUpdate(() => {
              setLive(null)
              markStep(idx, 'done', `${vp} passed`)
              pushMsg(`Validation complete — ${vp} of ${vi} passed.`)
            })
          }

        } else if (name === 'deduplicate') {
          if (err) {
            scheduleUpdate(() => { setLive(null); markStep(idx, 'error'); pushMsg(`Deduplication failed: ${r.message}`) })
          } else {
            const kept = r.kept as number, removed = r.removed as number
            scheduleUpdate(() => {
              setLive(null)
              markStep(idx, 'done', `${kept} unique`)
              pushMsg(
                removed > 0
                  ? `Removed ${removed} near-duplicate${removed > 1 ? 's' : ''}. ${kept} unique images remain.`
                  : `No duplicates found — all ${kept} images are unique.`
              )
            })
          }

        } else if (name === 'export_dataset') {
          if (err) {
            scheduleUpdate(() => { setLive(null); markStep(idx, 'error'); pushMsg(`Export failed: ${r.message}`) })
          } else {
            const count   = r.image_count as number
            const splits  = r.splits as { train: number; val: number; test: number }
            const exports = r.exports as Record<string, string>
            scheduleUpdate(() => {
              setLive(null)
              setExportData({ exports, image_count: count, splits })
              markStep(idx, 'done', `${count} images`)
              pushMsg(
                `Dataset ready! ${count} images exported in YOLO and COCO format.`,
                splits ? `${splits.train} train · ${splits.val} val · ${splits.test} test` : undefined
              )
            })
          }
        }
      }

      // ── AGENT TEXT (streaming tokens accumulate, flushed before tool events) ─
      if (part.text && ev.author !== 'user') {
        pendingText.current += part.text as string
      }
    }
  }

  useEffect(() => {
    if (!jobId || !prompt || started.current) return
    started.current = true
    nextUpdateAt.current = 0

    const stop = streamRun(
      decodeURIComponent(jobId), prompt, handleEvent,
      () => {
        // flush any final agent text then mark complete
        const t = pendingText.current.trim()
        if (t) { pushMsg(t); pendingText.current = '' }
        setTimeout(() => {
          setDone(true)
          setLive(null)
          setSteps(p => p.map(s =>
            s.status === 'running' || s.status === 'pending' ? { ...s, status: 'done' } : s
          ))
        }, nextUpdateAt.current - Date.now() + 200)
      },
      err => { setError(err.message); setLive(null) },
    )
    return stop
  }, [jobId, prompt])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, live])

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ height: 'calc(100vh - 5.5rem)' }}>

        {/* ── Pipeline sidebar ─────────────────────────────────────── */}
        <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto">
          <div className="glass p-5">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-widest mb-5">Pipeline</p>
            <PipelineStatus steps={steps} />
          </div>
          {exportData && (
            <ExportPanel
              exports={exportData.exports}
              imageCount={exportData.image_count}
              splits={exportData.splits}
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
                <div className="w-7 h-7 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin block" />
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
          </div>
        </div>
      </div>
    </div>
  )
}
