import { Check, Loader2, Circle } from 'lucide-react'

export type StepStatus = 'pending' | 'running' | 'done' | 'error'

export interface PipelineStep {
  id: string
  label: string
  status: StepStatus
  detail?: string
}

export default function PipelineStatus({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="space-y-1">
      {steps.map((step, i) => (
        <div key={step.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <StepIcon status={step.status} />
            {i < steps.length - 1 && (
              <div className={`w-px flex-1 my-1 transition-colors duration-500 ${
                step.status === 'done' ? 'bg-accent/30' : 'bg-border-bright/30'
              }`} />
            )}
          </div>
          <div className="pb-4 flex-1 min-w-0 pt-0.5">
            <p className={`text-sm font-medium transition-colors duration-200 ${
              step.status === 'pending' ? 'text-muted-fg' :
              step.status === 'running' ? 'text-fg' :
              step.status === 'done'    ? 'text-fg' : 'text-danger'
            }`}>
              {step.label}
            </p>
            {step.detail && (
              <p className="text-xs text-muted-fg mt-0.5 truncate">{step.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') return (
    <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.4)]">
      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
    </div>
  )
  if (status === 'running') return (
    <div className="w-5 h-5 rounded-full bg-primary-dim border border-primary/40 flex items-center justify-center flex-shrink-0 shadow-[0_0_8px_rgba(99,102,241,0.3)]">
      <Loader2 className="w-2.5 h-2.5 text-primary animate-spin" />
    </div>
  )
  if (status === 'error') return (
    <div className="w-5 h-5 rounded-full bg-danger-dim border border-danger/40 flex items-center justify-center flex-shrink-0">
      <span className="text-danger text-xs font-bold leading-none">!</span>
    </div>
  )
  return (
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <Circle className="w-2.5 h-2.5 text-muted" />
    </div>
  )
}
