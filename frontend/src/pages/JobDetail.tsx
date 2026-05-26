import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { streamRun, type AgentEvent } from '../lib/api'
import PipelineStatus, { type PipelineStep } from '../components/PipelineStatus'
import ExportPanel from '../components/ExportPanel'
import { Bot, User } from 'lucide-react'

interface Message {
  role: 'user' | 'agent' | 'tool'
  text: string
  toolName?: string
}

interface ExportData {
  exports: Record<string, string>
  image_count: number
  splits?: { train: number; val: number; test: number }
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: 'search', label: 'Image Collection', status: 'pending' },
  { id: 'annotate', label: 'Gemini Annotation', status: 'pending' },
  { id: 'validate', label: 'Validation', status: 'pending' },
  { id: 'deduplicate', label: 'Deduplication', status: 'pending' },
  { id: 'export', label: 'Export (YOLO / COCO)', status: 'pending' },
]

const TOOL_STEP_MAP: Record<string, number> = {
  search_images: 0,
  annotate_image: 1,
  validate_annotation: 2,
  deduplicate: 3,
  export_dataset: 4,
}

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>()
  const [searchParams] = useSearchParams()
  const prompt = searchParams.get('q') ?? ''

  const [messages, setMessages] = useState<Message[]>([
    { role: 'user', text: prompt },
  ])
  const [steps, setSteps] = useState<PipelineStep[]>(PIPELINE_STEPS.map(s => ({ ...s })))
  const [exportData, setExportData] = useState<ExportData | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const activeStep = useRef<number>(-1)
  const started = useRef(false)

  function markStep(idx: number, status: PipelineStep['status'], detail?: string) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, status, detail } : s))
  }

  function handleEvent(event: AgentEvent) {
    const parts = event.content?.parts ?? []

    for (const part of parts) {
      if (part.function_call) {
        const stepIdx = TOOL_STEP_MAP[part.function_call.name]
        if (stepIdx !== undefined) {
          // Mark previous step done
          if (activeStep.current >= 0 && activeStep.current !== stepIdx) {
            markStep(activeStep.current, 'done')
          }
          activeStep.current = stepIdx
          markStep(stepIdx, 'running')
        }
        setMessages(prev => [...prev, {
          role: 'tool',
          text: `Calling ${part.function_call!.name}…`,
          toolName: part.function_call!.name,
        }])
      }

      if (part.function_response) {
        const name = part.function_response.name
        const resp = part.function_response.response as Record<string, unknown>
        const stepIdx = TOOL_STEP_MAP[name]

        if (name === 'export_dataset' && resp.status === 'ok') {
          setExportData({
            exports: resp.exports as Record<string, string>,
            image_count: resp.image_count as number,
            splits: resp.splits as { train: number; val: number; test: number },
          })
          if (stepIdx !== undefined) markStep(stepIdx, 'done')
          activeStep.current = -1
        }

        const detail = resp.message as string | undefined
          ?? (resp.collected != null ? `${resp.collected} images collected` : undefined)
          ?? (resp.kept != null ? `${resp.kept} kept, ${resp.removed} removed` : undefined)

        if (stepIdx !== undefined && resp.status !== 'error') {
          markStep(stepIdx, 'done', detail)
        } else if (stepIdx !== undefined && resp.status === 'error') {
          markStep(stepIdx, 'error', detail)
        }
      }

      if (part.text && event.author !== 'user') {
        setMessages(prev => [...prev, { role: 'agent', text: part.text! }])
      }
    }
  }

  useEffect(() => {
    if (!jobId || !prompt || started.current) return
    started.current = true

    const stop = streamRun(
      decodeURIComponent(jobId),
      prompt,
      handleEvent,
      () => {
        setDone(true)
        if (activeStep.current >= 0) {
          markStep(activeStep.current, 'done')
          activeStep.current = -1
        }
      },
      (err) => setError(err.message),
    )

    return stop
  }, [jobId, prompt])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Pipeline status */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-fg mb-5">Pipeline</h2>
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

        {/* Right: Agent log */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-surface flex flex-col" style={{ height: 'calc(100vh - 9rem)' }}>
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Agent Log</h2>
            {!done && !error && (
              <span className="flex items-center gap-1.5 text-xs text-accent">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />
                Running
              </span>
            )}
            {done && <span className="text-xs text-muted-fg">Complete</span>}
            {error && <span className="text-xs text-danger">Error</span>}
          </div>

          <div ref={logRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className="animate-fade-in">
                {msg.role === 'user' && (
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-3 h-3 text-primary" />
                    </div>
                    <p className="text-sm text-fg pt-0.5">{msg.text}</p>
                  </div>
                )}
                {msg.role === 'agent' && (
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3 h-3 text-accent" />
                    </div>
                    <p className="text-sm text-fg-secondary pt-0.5 whitespace-pre-wrap">{msg.text}</p>
                  </div>
                )}
                {msg.role === 'tool' && (
                  <div className="ml-9">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-fg bg-border/50 px-2.5 py-1 rounded-full">
                      <span className="w-1 h-1 rounded-full bg-muted-fg" />
                      {msg.text}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
