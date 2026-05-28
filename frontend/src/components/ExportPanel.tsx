import { Download, PackageOpen } from 'lucide-react'

interface Props {
  jobId: string
  exports: Record<string, string>
  imageCount: number
  splits?: { train: number; val: number; test: number }
}

export default function ExportPanel({ jobId, exports, imageCount, splits }: Props) {
  const fmts = Object.entries(exports).filter(([, uri]) => uri && !uri.startsWith('error'))

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
            { label: 'Train', value: splits.train, color: 'text-primary', bg: 'bg-primary-dim' },
            { label: 'Val',   value: splits.val,   color: 'text-accent',  bg: 'bg-accent-dim'  },
            { label: 'Test',  value: splits.test,  color: 'text-muted-fg', bg: 'bg-surface-2'  },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-xl ${bg} border border-border p-3 text-center`}>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-fg">{label}</p>
            </div>
          ))}
        </div>
      )}

      {fmts.length > 0 && (
        <div className="space-y-2">
          {fmts.map(([fmt]) => (
            <a
              key={fmt}
              href={`/api/download/${jobId}/${fmt}`}
              download
              className="btn-primary w-full justify-center text-sm"
            >
              <Download className="w-4 h-4" />
              Download {fmt.toUpperCase()}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
