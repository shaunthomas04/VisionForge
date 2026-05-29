import {
  createContext, useContext, useRef, useState,
  type ReactNode,
} from 'react'
import { streamRun } from '../lib/api'
import type { AgentEvent } from '../lib/api'
import type { PipelineStep } from '../components/PipelineStatus'

// ── Public types ─────────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'agent' | 'progress'
  text: string
  detail?: string
  variant?: 'pass' | 'fail' | 'neutral'
}

export interface LiveProgress {
  label: string
  current: number
  total: number
}

export interface ExportData {
  job_id: string
  exports: Record<string, string>
  image_count: number
  splits?: { train: number; val: number; test: number }
}

export interface JobState {
  jobId: string
  prompt: string
  query: string
  steps: PipelineStep[]
  messages: Message[]
  live: LiveProgress | null
  exportData: ExportData | null
  done: boolean
  error: string | null
}

interface JobCtxValue {
  job: JobState | null
  startJob: (jobId: string, prompt: string, query: string) => void
  clearJob: () => void
}

// ── Pure state transformers ──────────────────────────────────────────────────

function withMsg(
  j: JobState,
  role: Message['role'],
  text: string,
  detail?: string,
  variant?: Message['variant'],
): JobState {
  return { ...j, messages: [...j.messages, { role, text, detail, variant }] }
}

function withStep(
  j: JobState,
  idx: number,
  status: PipelineStep['status'],
  detail?: string,
): JobState {
  return { ...j, steps: j.steps.map((s, i) => (i === idx ? { ...s, status, detail } : s)) }
}

function withTransition(j: JobState, idx: number): JobState {
  return {
    ...j,
    steps: j.steps.map((s, i) => {
      if (i < idx && (s.status === 'running' || s.status === 'pending')) return { ...s, status: 'done' }
      if (i === idx) return { ...s, status: 'running' }
      return s
    }),
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const INIT_STEPS: PipelineStep[] = [
  { id: 'search',      label: 'Image Collection',     status: 'pending' },
  { id: 'annotate',    label: 'Gemini Annotation',    status: 'pending' },
  { id: 'validate',    label: 'Validation',           status: 'pending' },
  { id: 'deduplicate', label: 'Deduplication',        status: 'pending' },
  { id: 'export',      label: 'Export (YOLO / COCO)', status: 'pending' },
]

const TOOL_STEP: Record<string, number> = {
  search_images: 0, annotate_images: 1,
  validate_annotations: 2, deduplicate: 3, export_dataset: 4,
}

// ── Context ──────────────────────────────────────────────────────────────────

const Ctx = createContext<JobCtxValue>({ job: null, startJob: () => {}, clearJob: () => {} })

export function JobProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<JobState | null>(null)

  const stopRef     = useRef<(() => void) | null>(null)
  const pendingText = useRef('')
  const nextUpdateAt = useRef(0)

  function scheduleUpdate(fn: (prev: JobState) => JobState) {
    const now  = Date.now()
    const when = Math.max(now + 10, nextUpdateAt.current)
    nextUpdateAt.current = when + 100
    setTimeout(() => setJob(j => (j ? fn(j) : j)), when - now)
  }

  function flushPendingText() {
    const t = pendingText.current.trim()
    if (t) {
      scheduleUpdate(j => withMsg(j, 'agent', t))
      pendingText.current = ''
    }
  }

  function handleEvent(ev: AgentEvent) {
    const tc = ev as Record<string, unknown>
    if (
      ev.turn_complete ||
      ev.actions?.turn_complete ||
      tc.turn_complete === true
    ) {
      flushPendingText()
      return
    }

    for (const part of ev.content?.parts ?? []) {
      const p = part as Record<string, unknown>

      const fc = (p.function_call ?? p.functionCall) as
        | { name: string; args?: Record<string, unknown> }
        | undefined
      const fr = (p.function_response ?? p.functionResponse) as
        | { name: string; response: unknown }
        | undefined

      // ── TOOL CALLS ──────────────────────────────────────────────────────────
      if (fc) {
        flushPendingText()
        const { name } = fc

        if (name === 'search_images') {
          scheduleUpdate(j => ({
            ...withTransition(j, 0),
            live: { label: 'Collecting images', current: 0, total: 0 },
          }))

        } else if (name === 'annotate_images') {
          const n = (fc.args?.images as unknown[])?.length ?? 0
          scheduleUpdate(j => ({
            ...withTransition(j, 1),
            live: { label: `Annotating ${n} images in parallel`, current: 0, total: 0 },
          }))

        } else if (name === 'validate_annotations') {
          const n = (fc.args?.annotations as unknown[])?.length ?? 0
          scheduleUpdate(j => ({
            ...withTransition(j, 2),
            live: { label: `Validating ${n} annotations in parallel`, current: 0, total: 0 },
          }))

        } else if (name === 'deduplicate') {
          scheduleUpdate(j => ({
            ...withTransition(j, 3),
            live: { label: 'Scanning for near-duplicates', current: 0, total: 0 },
          }))

        } else if (name === 'export_dataset') {
          scheduleUpdate(j => ({
            ...withTransition(j, 4),
            live: { label: 'Generating YOLO & COCO archives', current: 0, total: 0 },
          }))
        }
      }

      // ── TOOL RESPONSES ──────────────────────────────────────────────────────
      if (fr) {
        const { name, response: resp } = fr
        const r   = resp as Record<string, unknown>
        const idx = TOOL_STEP[name] ?? -1
        const err = r.status === 'error'

        if (name === 'search_images') {
          if (err) {
            scheduleUpdate(j => ({
              ...withMsg(j, 'agent', `Search failed: ${r.message}`),
              live: null,
              steps: j.steps.map((s, i) => (i === idx ? { ...s, status: 'error' } : s)),
            }))
          } else {
            const collected = r.collected as number
            scheduleUpdate(j =>
              withMsg(
                withStep({ ...j, live: null }, idx, 'done', `${collected} collected`),
                'agent',
                `Found ${collected} images and uploaded them to GCS.`,
              )
            )
          }

        } else if (name === 'annotate_images') {
          if (err) {
            scheduleUpdate(j => ({
              ...withMsg(j, 'agent', `Annotation failed: ${r.message}`),
              live: null,
              steps: j.steps.map((s, i) => (i === idx ? { ...s, status: 'error' } : s)),
            }))
          } else {
            const processed = r.processed as number
            const annCount  = r.annotation_count as number
            const skipped   = r.skipped as number
            scheduleUpdate(j =>
              withMsg(
                withStep({ ...j, live: null }, idx, 'done', `${annCount} objects found`),
                'agent',
                `Annotated ${processed} images — ${annCount} objects detected${skipped > 0 ? `, ${skipped} skipped` : ''}.`,
              )
            )
          }

        } else if (name === 'validate_annotations') {
          if (err) {
            scheduleUpdate(j => ({
              ...withMsg(j, 'agent', `Validation failed: ${r.message}`),
              live: null,
              steps: j.steps.map((s, i) => (i === idx ? { ...s, status: 'error' } : s)),
            }))
          } else {
            const passed   = r.passed as number
            const total    = r.total as number
            const rejected = r.rejected as number
            scheduleUpdate(j =>
              withMsg(
                withStep({ ...j, live: null }, idx, 'done', `${passed} passed`),
                'agent',
                `Validation complete — ${passed} of ${total} passed${rejected > 0 ? `, ${rejected} rejected` : ''}.`,
              )
            )
          }

        } else if (name === 'deduplicate') {
          if (err) {
            scheduleUpdate(j => ({
              ...withMsg(j, 'agent', `Deduplication failed: ${r.message}`),
              live: null,
              steps: j.steps.map((s, i) => (i === idx ? { ...s, status: 'error' } : s)),
            }))
          } else {
            const kept    = r.kept as number
            const removed = r.removed as number
            scheduleUpdate(j =>
              withMsg(
                withStep({ ...j, live: null }, idx, 'done', `${kept} unique`),
                'agent',
                removed > 0
                  ? `Removed ${removed} near-duplicate${removed > 1 ? 's' : ''}. ${kept} unique images remain.`
                  : `No duplicates found — all ${kept} images are unique.`,
              )
            )
          }

        } else if (name === 'export_dataset') {
          if (err) {
            scheduleUpdate(j => ({
              ...withMsg(j, 'agent', `Export failed: ${r.message}`),
              live: null,
              steps: j.steps.map((s, i) => (i === idx ? { ...s, status: 'error' } : s)),
            }))
          } else {
            const count  = r.image_count as number
            const splits = r.splits as { train: number; val: number; test: number }
            const exps   = r.exports as Record<string, string>
            const eid    = r.job_id as string
            scheduleUpdate(j =>
              withMsg(
                withStep(
                  { ...j, live: null, exportData: { job_id: eid, exports: exps, image_count: count, splits } },
                  idx,
                  'done',
                  `${count} images`,
                ),
                'agent',
                `Dataset ready — ${count} images exported in YOLO and COCO format.`,
                splits ? `${splits.train} train · ${splits.val} val · ${splits.test} test` : undefined,
              )
            )
          }
        }
      }

      // ── AGENT TEXT (streaming tokens, accumulated then flushed) ─────────────
      if (part.text && ev.author !== 'user') {
        pendingText.current += part.text
      }
    }
  }

  function onDone() {
    const t = pendingText.current.trim()
    if (t) {
      setJob(j => (j ? withMsg(j, 'agent', t) : j))
      pendingText.current = ''
    }
    const delay = Math.max(200, nextUpdateAt.current - Date.now() + 200)
    setTimeout(() => {
      setJob(j =>
        j
          ? {
              ...j,
              done: true,
              live: null,
              steps: j.steps.map(s =>
                s.status === 'running' || s.status === 'pending' ? { ...s, status: 'done' } : s,
              ),
            }
          : j,
      )
    }, delay)
  }

  function onError(err: Error) {
    setJob(j => (j ? { ...j, error: err.message, live: null } : j))
  }

  function startJob(jobId: string, prompt: string, query: string) {
    if (stopRef.current) { stopRef.current(); stopRef.current = null }

    pendingText.current  = ''
    nextUpdateAt.current = 0

    setJob({
      jobId,
      prompt,
      query,
      steps:      INIT_STEPS.map(s => ({ ...s })),
      messages:   [{ role: 'user', text: prompt }],
      live:       null,
      exportData: null,
      done:       false,
      error:      null,
    })

    stopRef.current = streamRun(jobId, prompt, handleEvent, onDone, onError)
  }

  function clearJob() {
    if (stopRef.current) { stopRef.current(); stopRef.current = null }
    setJob(null)
  }

  return <Ctx.Provider value={{ job, startJob, clearJob }}>{children}</Ctx.Provider>
}

export function useJob() { return useContext(Ctx) }
