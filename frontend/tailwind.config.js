/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg:         '#080812',
        surface:    '#0E0E1A',
        'surface-2':'#141422',
        border:     'rgba(255,255,255,0.07)',
        'border-bright': 'rgba(255,255,255,0.12)',
        muted:      '#2A2A42',
        'muted-fg': '#6B6B8A',
        fg:         '#F0F0FF',
        'fg-2':     '#A0A0C0',
        primary:    '#6366F1',
        'primary-hover': '#4F52E0',
        'primary-dim': 'rgba(99,102,241,0.15)',
        accent:     '#22C55E',
        'accent-dim': 'rgba(34,197,94,0.15)',
        danger:     '#EF4444',
        'danger-dim':'rgba(239,68,68,0.12)',
        gold:       '#F59E0B',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glow-primary': 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.15) 0%, transparent 60%)',
      },
      boxShadow: {
        'glass': '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        'glow':  '0 0 20px rgba(99,102,241,0.3)',
        'glow-sm': '0 0 10px rgba(99,102,241,0.2)',
      },
      animation: {
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':    'fadeIn 0.25s ease-out',
        'slide-in':   'slideIn 0.3s cubic-bezier(0.16,1,0.3,1)',
        'dots':       'dots 1.4s infinite',
        'shimmer':    'shimmer 1.8s infinite',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity:'0', transform:'translateY(6px)' }, '100%': { opacity:'1', transform:'translateY(0)' } },
        slideIn: { '0%': { opacity:'0', transform:'translateX(20px)' }, '100%': { opacity:'1', transform:'translateX(0)' } },
        dots:    { '0%,80%,100%': { transform:'scale(0.6)', opacity:'0.3' }, '40%': { transform:'scale(1)', opacity:'1' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      backdropBlur: { xs: '4px' },
    },
  },
  plugins: [],
}
