import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Database, HelpCircle } from 'lucide-react'
import HelpModal from './HelpModal'
import { useJob } from '../contexts/JobContext'


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
            <img src="/logo.png" alt="VisionForge" className="w-8 h-8 rounded-lg object-contain" />
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
