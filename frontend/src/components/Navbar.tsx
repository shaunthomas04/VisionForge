import { Link, useLocation } from 'react-router-dom'
import { Eye, Database } from 'lucide-react'

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Eye className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-fg text-sm tracking-tight">VisionForge</span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink to="/" active={pathname === '/'}>Build</NavLink>
          <NavLink to="/datasets" active={pathname === '/datasets'}>
            <Database className="w-3.5 h-3.5" />
            Datasets
          </NavLink>
        </nav>
      </div>
    </header>
  )
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
        active
          ? 'bg-border text-fg'
          : 'text-muted-fg hover:text-fg hover:bg-border/50'
      }`}
    >
      {children}
    </Link>
  )
}
