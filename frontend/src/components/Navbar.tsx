import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Database, HelpCircle } from 'lucide-react'
import HelpModal from './HelpModal'
import { useJob } from '../contexts/JobContext'

/** CV dataset icon — image frame with a detection bounding box inside */
function VisionForgeLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#6366F1" />
          <stop offset="60%"  stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#22C55E" />
        </linearGradient>
        <linearGradient id="boxGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#22C55E" />
        </linearGradient>
      </defs>

      {/* Outer image frame */}
      <rect x="2" y="2" width="28" height="28" rx="7" fill="url(#logoGrad)" opacity="0.15" />
      <rect x="2" y="2" width="28" height="28" rx="7" stroke="url(#logoGrad)" strokeWidth="1.5" fill="none" />

      {/* Mountain/landscape silhouette (image placeholder) */}
      <path d="M5 22 L11 13 L16 18 L20 11 L27 22 Z" fill="url(#logoGrad)" opacity="0.25" />

      {/* Detection bounding box */}
      <rect x="9" y="9" width="14" height="14" rx="1.5"
        stroke="url(#boxGrad)" strokeWidth="1.5" fill="none"
        strokeDasharray="3 2" />

      {/* Corner ticks — top-left */}
      <path d="M9 12 L9 9 L12 9" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Corner ticks — bottom-right */}
      <path d="M23 20 L23 23 L20 23" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Center target dot */}
      <circle cx="16" cy="16" r="1.5" fill="#22C55E" opacity="0.9" />
    </svg>
  )
}

export default function Navbar() {
  const { pathname } = useLocation()
  const [showHelp, setShowHelp] = useState(false)
  const { job } = useJob()

  const isRunning = job && !job.done && !job.error
  const jobUrl    = job
    ? `/job/${encodeURIComponent(job.jobId)}?q=${encodeURIComponent(job.prompt)}&label=${encodeURIComponent(job.query)}`
    : '/'

  return (
    <>
      <header className="border-b border-border bg-surface/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <VisionForgeLogo />
            <span
              className="font-bold text-sm tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #F0F0FF 30%, #A78BFA 70%, #22C55E)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              VisionForge
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <NavLink to="/" active={pathname === '/'}>Build</NavLink>
            <NavLink to="/datasets" active={pathname === '/datasets'}>
              <Database className="w-3.5 h-3.5" />
              Datasets
            </NavLink>

            {/* Active job badge — visible while pipeline is running */}
            {isRunning && (
              <Link
                to={jobUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                           text-primary bg-primary-dim border border-primary/20 ml-1
                           hover:bg-primary/15 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
                {job.query || 'Job running'}
              </Link>
            )}

            <button
              onClick={() => setShowHelp(true)}
              className="btn-ghost flex items-center gap-1.5 ml-1"
              aria-label="Help"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Help
            </button>
          </div>
        </div>
      </header>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  )
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
        active
          ? 'bg-primary-dim text-primary'
          : 'text-muted-fg hover:text-fg hover:bg-surface-2'
      }`}
    >
      {children}
    </Link>
  )
}
