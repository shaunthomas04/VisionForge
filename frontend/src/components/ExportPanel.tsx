import { useState } from 'react'
import { Download, Copy, Check } from 'lucide-react'

interface Exports {
  yolo?: string
  coco?: string
}

interface Props {
  exports: Exports
  imageCount: number
  splits?: { train: number; val: number; test: number }
}

export default function ExportPanel({ exports, imageCount, splits }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  function copyUri(fmt: string, uri: string) {
    navigator.clipboard.writeText(uri)
    setCopied(fmt)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-fg text-sm">Export Ready</h3>
        <span className="text-xs text-muted-fg">{imageCount} images</span>
      </div>

      {splits && (
        <div className="flex gap-2">
          {[
            { label: 'Train', value: splits.train, color: 'bg-primary' },
            { label: 'Val', value: splits.val, color: 'bg-accent' },
            { label: 'Test', value: splits.test, color: 'bg-muted' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex-1 bg-bg rounded-lg p-2.5 text-center">
              <div className={`w-2 h-2 rounded-full ${color} mx-auto mb-1`} />
              <div className="text-xs text-muted-fg">{label}</div>
              <div className="text-sm font-semibold text-fg">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {Object.entries(exports).map(([fmt, uri]) => {
          if (!uri || uri.startsWith('error')) return null
          return (
            <div key={fmt} className="flex items-center gap-2 bg-bg rounded-lg p-3 border border-border">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-fg uppercase tracking-wide">{fmt}</div>
                <div className="text-xs text-muted-fg truncate mt-0.5">{uri}</div>
              </div>
              <button
                onClick={() => copyUri(fmt, uri)}
                className="p-1.5 rounded-md hover:bg-border transition-colors cursor-pointer flex-shrink-0"
                title="Copy GCS URI"
                aria-label={`Copy ${fmt} URI`}
              >
                {copied === fmt
                  ? <Check className="w-3.5 h-3.5 text-accent" />
                  : <Copy className="w-3.5 h-3.5 text-muted-fg" />
                }
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-fg">
        Use <code className="bg-border px-1 py-0.5 rounded text-xs">gcloud storage cp &lt;URI&gt; ./</code> to download
      </p>
    </div>
  )
}
