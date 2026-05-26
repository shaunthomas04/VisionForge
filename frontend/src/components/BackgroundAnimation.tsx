export default function BackgroundAnimation() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      {/* Dot grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
      }} />

      {/* Orb 1 — indigo, top-left */}
      <div className="orb orb-1" />
      {/* Orb 2 — emerald, bottom-right */}
      <div className="orb orb-2" />
      {/* Orb 3 — violet, center-ish */}
      <div className="orb orb-3" />
      {/* Orb 4 — green accent, mid-left */}
      <div className="orb orb-4" />

      {/* Vignette to keep edges dark */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(8,8,18,0.7) 100%)',
      }} />
    </div>
  )
}
