import { useState } from 'react'
import { Copy, Check, PackageOpen } from 'lucide-react'

interface Props {
  exports: Record<string, string>
  imageCount: number
  splits?: { train: number; val: number; test: number }
}

export default function ExportPanel({ exports, imageCount, splits }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(fmt: string, uri: string) {
    navigator.clipboard.writeText(uri)
    setCopied(fmt)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-accent-dim flex items-center justify-center">
          <PackageOpen className="w-3.5 h-3.5 text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-fg">Export Ready</p>
          <p className="text-xs text-muted-fg">{imageCount} images</p>
        </div>
      </div>

      {splits && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Train', value: splits.train, color: 'text-primary', glow: 'shadow-[0_0_6px_rgba(99,102,241,0.3)]', bg: 'bg-primary-dim' },
            { label: 'Val',   value: splits.val,   color: 'text-accent',  glow: 'shadow-[0_0_6px_rgba(34,197,94,0.25)]', bg: 'bg-accent-dim' },
            { label: 'Test',  value: splits.test,  color: 'text-muted-fg',glow: '', bg: 'bg-surface-2' },
          ].map(({ label, value, color, glow, bg }) => (
            <div key={label} className={`rounded-xl ${bg} border border-border p-3 text-center ${glow}`}>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-fg">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {Object.entries(exports).map(([fmt, uri]) => {
          if (!uri || uri.startsWith('error')) return null
          return (
            <div key={fmt} className="glass-sm flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-fg uppercase tracking-wider">{fmt}</p>
                <p className="text-xs text-muted-fg truncate mt-0.5">{uri}</p>
              </div>
              <button
                onClick={() => copy(fmt, uri)}
                className="p-1.5 rounded-lg hover:bg-surface transition-colors cursor-pointer flex-shrink-0"
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
        Download with <code className="bg-surface-2 border border-border px-1.5 py-0.5 rounded text-xs">gcloud storage cp &lt;URI&gt; ./</code>
      </p>
    </div>
  )
}
