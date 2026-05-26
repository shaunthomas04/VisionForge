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
}

interface ExportData {
  exports: Record<string, string>
  image_count: number
  splits?: { train: number; val: number; test: number }
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: 'search',      label: 'Image Collection',    status: 'pending' },
  { id: 'annotate',    label: 'Gemini Annotation',   status: 'pending' },
  { id: 'validate',    label: 'Validation',          status: 'pending' },
  { id: 'deduplicate', label: 'Deduplication',       status: 'pending' },
  { id: 'export',      label: 'Export (YOLO / COCO)',status: 'pending' },
]

const TOOL_STEP_MAP: Record<string, number> = {
  search_images: 0, annotate_image: 1,
  validate_annotation: 2, deduplicate: 3, export_dataset: 4,
}

export default function JobDetail() {
  const { jobId }         = useParams<{ jobId: string }>()
  const [searchParams]    = useSearchParams()
  const prompt            = searchParams.get('q') ?? ''

  const [messages, setMessages] = useState<Message[]>([{ role: 'user', text: prompt }])
  const [steps, setSteps]       = useState<PipelineStep[]>(PIPELINE_STEPS.map(s => ({ ...s })))
  const [exportData, setExportData] = useState<ExportData | null>(null)
  const [done, setDone]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef            = useRef<HTMLDivElement>(null)

  const activeStep    = useRef(-1)
  const started       = useRef(false)
  const totalImages   = useRef(0)
  const annotateIdx   = useRef(0)
  const validateIdx   = useRef(0)
  const validatePassed= useRef(0)

  const addAgent    = (text: string, detail?: string) =>
    setMessages(p => [...p, { role: 'agent', text, detail }])
  const addProgress = (text: string, detail?: string) =>
    setMessages(p => [...p, { role: 'progress', text, detail }])

  function markStep(idx: number, status: PipelineStep['status'], detail?: string) {
    setSteps(p => p.map((s, i) => i === idx ? { ...s, status, detail } : s))
  }

  function handleEvent(event: AgentEvent) {
    for (const part of event.content?.parts ?? []) {

      if (part.function_call) {
        const { name, args = {} } = part.function_call
        const idx = TOOL_STEP_MAP[name]
        if (idx !== undefined) {
          if (activeStep.current >= 0 && activeStep.current !== idx) markStep(activeStep.current, 'done')
          activeStep.current = idx
          markStep(idx, 'running')
        }
        if (name === 'search_images') {
          addAgent(`Searching Unsplash for "${args.query ?? 'images'}" — targeting ${args.count ?? '?'} images…`)
        } else if (name === 'annotate_image') {
          annotateIdx.current++
          addProgress(`Annotating image ${annotateIdx.current} of ${totalImages.current || '?'}…`)
        } else if (name === 'validate_annotation') {
          validateIdx.current++
          addProgress(`Validating annotation ${validateIdx.current}…`)
        } else if (name === 'deduplicate') {
          addAgent(`Scanning ${totalImages.current} images for near-duplicates using perceptual hashing…`)
        } else if (name === 'export_dataset') {
          addAgent('Generating YOLO and COCO archives…')
        }
      }

      if (part.function_response) {
        const { name, response: resp } = part.function_response
        const r = resp as Record<string, unknown>
        const idx = TOOL_STEP_MAP[name]
        const isErr = r.status === 'error'

        if (name === 'search_images') {
          if (isErr) { addAgent(`Search failed: ${r.message}`); markStep(idx, 'error') }
          else {
            totalImages.current = r.collected as number
            addAgent(
              `Found ${r.collected} images and uploaded them to GCS.`,
              'Starting Gemini Vision annotation on each one…'
            )
            markStep(idx, 'done', `${r.collected} collected`)
          }
        } else if (name === 'annotate_image') {
          const anns = (r.annotations as Array<Record<string, unknown>>) ?? []
          if (anns.length > 0) {
            const labels = anns.map(a => `${a.class_name} · ${Math.round((a.confidence as number) * 100)}%`).join('  ·  ')
            addProgress(`→ ${labels}`, 'confirmed')
          } else {
            addProgress('→ No object detected, skipping')
          }
          if (annotateIdx.current >= totalImages.current && totalImages.current > 0) {
            addAgent(`All ${totalImages.current} images annotated. Running validation pass…`)
            markStep(idx, 'done', `${totalImages.current} annotated`)
          }
        } else if (name === 'validate_annotation') {
          const passed = r.passed as boolean
          if (passed) {
            validatePassed.current++
            addProgress(`→ Confirmed  ${Math.round((r.confidence as number) * 100)}% confidence`, 'passed')
          } else {
            addProgress(`→ Rejected: ${r.rejection_reason ?? 'low confidence'}`, 'rejected')
          }
          if (validateIdx.current >= annotateIdx.current && annotateIdx.current > 0) {
            addAgent(
              `Validation complete — ${validatePassed.current} of ${validateIdx.current} annotations passed.`
            )
            markStep(idx, 'done', `${validatePassed.current} passed`)
          }
        } else if (name === 'deduplicate') {
          if (isErr) { addAgent(`Deduplication failed: ${r.message}`); markStep(idx, 'error') }
          else {
            const kept = r.kept as number, removed = r.removed as number
            addAgent(
              removed > 0
                ? `Removed ${removed} near-duplicate${removed > 1 ? 's' : ''}. ${kept} unique images remain.`
                : `No duplicates found — all ${kept} images are unique.`
            )
            markStep(idx, 'done', `${kept} kept`)
          }
        } else if (name === 'export_dataset') {
          if (isErr) { addAgent(`Export failed: ${r.message}`); markStep(idx, 'error') }
          else {
            const count = r.image_count as number
            const splits = r.splits as { train: number; val: number; test: number }
            setExportData({ exports: r.exports as Record<string, string>, image_count: count, splits })
            addAgent(
              `Dataset ready! ${count} images exported in YOLO and COCO format.`,
              splits ? `Split: ${splits.train} train / ${splits.val} val / ${splits.test} test` : undefined
            )
            markStep(idx, 'done', `${count} images`)
            activeStep.current = -1
          }
        }
      }

      if (part.text && event.author !== 'user') {
        const t = (part.text as string).trim()
        if (t) addAgent(t)
      }
    }
  }

  useEffect(() => {
    if (!jobId || !prompt || started.current) return
    started.current = true
    const stop = streamRun(
      decodeURIComponent(jobId), prompt,
      handleEvent,
      () => { setDone(true); if (activeStep.current >= 0) { markStep(activeStep.current, 'done'); activeStep.current = -1 } },
      err => setError(err.message),
    )
    return stop
  }, [jobId, prompt])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ height: 'calc(100vh - 5.5rem)' }}>

        {/* Left — Pipeline */}
        <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto">
          <div className="glass p-5">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-widest mb-5">Pipeline</p>
            <PipelineStatus steps={steps} />
          </div>
          {exportData && (
            <ExportPanel exports={exportData.exports} imageCount={exportData.image_count} splits={exportData.splits} />
          )}
        </div>

        {/* Right — Chat */}
        <div className="lg:col-span-2 glass flex flex-col overflow-hidden">
          {/* Chat header */}
          <div className="px-5 py-4 border-b border-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-accent-dim border border-accent/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-fg">VisionForge Agent</p>
              <p className="text-xs text-muted-fg">Gemini Vision · Google Cloud</p>
            </div>
            {!done && !error && (
              <div className="dot-typing"><span /><span /><span /></div>
            )}
            {done  && <span className="text-xs font-medium text-accent">Complete</span>}
            {error && <span className="text-xs font-medium text-danger">Error</span>}
          </div>

          {/* Messages */}
          <div ref={logRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className="animate-fade-in">

                {/* User — right-aligned bubble */}
                {msg.role === 'user' && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-primary rounded-2xl rounded-tr-sm px-4 py-3 shadow-glow-sm">
                      <p className="text-sm text-white leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                )}

                {/* Agent — left-aligned with avatar */}
                {msg.role === 'agent' && (
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-xl bg-accent-dim border border-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <div className="glass-sm px-4 py-3 max-w-[82%]">
                      <p className="text-sm text-fg leading-relaxed">{msg.text}</p>
                      {msg.detail && (
                        <p className="text-xs text-muted-fg mt-1">{msg.detail}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Progress — indented, compact */}
                {msg.role === 'progress' && (
                  <div className="ml-10 flex items-start gap-2 pl-2 border-l border-border">
                    <span className={`text-xs mt-0.5 flex-shrink-0 ${
                      msg.detail === 'confirmed' || msg.detail === 'passed' ? 'text-accent' :
                      msg.detail === 'rejected' ? 'text-danger' : 'text-muted-fg'
                    }`}>›</span>
                    <p className="text-xs text-muted-fg leading-relaxed">{msg.text}</p>
                  </div>
                )}
              </div>
            ))}

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
