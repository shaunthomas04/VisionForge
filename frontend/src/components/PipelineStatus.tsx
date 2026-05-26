import { Check, Loader2, Circle } from 'lucide-react'

export type StepStatus = 'pending' | 'running' | 'done' | 'error'

export interface PipelineStep {
  id: string
  label: string
  status: StepStatus
  detail?: string
}

interface Props {
  steps: PipelineStep[]
}

export default function PipelineStatus({ steps }: Props) {
  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex gap-3">
          {/* Icon column */}
          <div className="flex flex-col items-center">
            <StepIcon status={step.status} />
            {i < steps.length - 1 && (
              <div className={`w-px flex-1 my-1 ${step.status === 'done' ? 'bg-accent/40' : 'bg-border'}`} />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 flex-1 min-w-0">
            <p className={`text-sm font-medium leading-5 ${
              step.status === 'pending' ? 'text-muted-fg' :
              step.status === 'running' ? 'text-fg' :
              step.status === 'done' ? 'text-fg' :
              'text-danger'
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
  if (status === 'done') {
    return (
      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
        <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary flex items-center justify-center flex-shrink-0">
        <Loader2 className="w-3 h-3 text-primary animate-spin" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="w-5 h-5 rounded-full bg-danger/20 border border-danger flex items-center justify-center flex-shrink-0">
        <span className="text-danger text-xs font-bold">!</span>
      </div>
    )
  }
  return (
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <Circle className="w-3 h-3 text-muted" />
    </div>
  )
}
