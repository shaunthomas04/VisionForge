import { X, Search, Sparkles, ShieldCheck, Fingerprint, PackageOpen } from 'lucide-react'
import { useEffect } from 'react'

interface Props { onClose: () => void }

const STEPS = [
  {
    icon: Search,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    title: '1 · Image Collection',
    desc: 'VisionForge searches Unsplash for images matching your query, filters by resolution, and uploads them to Google Cloud Storage.',
  },
  {
    icon: Sparkles,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    title: '2 · Gemini Annotation',
    desc: 'Each image is sent to Gemini Vision, which detects all object instances and returns tight bounding boxes with class labels and confidence scores.',
  },
  {
    icon: ShieldCheck,
    color: 'text-green-400',
    bg: 'bg-green-400/10',
    title: '3 · Validation',
    desc: 'A second Gemini pass crops each bounding box and verifies the label. Annotations below 75% confidence or with bad geometry are rejected.',
  },
  {
    icon: Fingerprint,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    title: '4 · Deduplication',
    desc: 'Perceptual hashing (pHash) compares all images. Near-duplicates within a Hamming distance of 8 are removed, keeping the highest-resolution copy.',
  },
  {
    icon: PackageOpen,
    color: 'text-accent',
    bg: 'bg-accent-dim',
    title: '5 · Export',
    desc: 'The validated dataset is split 80/10/10 (train/val/test) and zipped in YOLO format (per-image .txt + data.yaml) and COCO format (annotations.json). Archives are saved to GCS.',
  },
]

const TIPS = [
  'Be specific — "golden retriever sitting" works better than "dog".',
  'Use 20–50 images for a quick test; 200+ for a production dataset.',
  'If fewer images pass than expected, try a broader query.',
  'Previously built datasets appear in the Datasets tab (requires MongoDB).',
]

export default function HelpModal({ onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div className="relative ml-auto w-full max-w-md h-full glass animate-slide-in flex flex-col rounded-none rounded-l-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="font-bold text-fg text-base">How VisionForge works</h2>
            <p className="text-xs text-muted-fg mt-0.5">5-step automated pipeline</p>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 rounded-lg"
            aria-label="Close help"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {STEPS.map(({ icon: Icon, color, bg, title, desc }) => (
            <div key={title} className="glass-sm p-4 flex gap-3">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4.5 h-4.5 ${color}`} size={18} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${color}`}>{title}</p>
                <p className="text-xs text-muted-fg mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}

          {/* Tips */}
          <div className="mt-2 rounded-xl border border-gold/20 bg-gold/5 p-4">
            <p className="text-xs font-semibold text-gold mb-2">Tips for better datasets</p>
            <ul className="space-y-1.5">
              {TIPS.map(tip => (
                <li key={tip} className="flex gap-2 text-xs text-muted-fg">
                  <span className="text-gold mt-0.5">·</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
