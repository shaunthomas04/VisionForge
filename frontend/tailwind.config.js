/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#09090B',
        surface: '#111114',
        border: '#1E1E24',
        muted: '#3F3F46',
        'muted-fg': '#71717A',
        fg: '#FAFAFA',
        'fg-secondary': '#A1A1AA',
        primary: '#2563EB',
        'primary-hover': '#1D4ED8',
        accent: '#059669',
        'accent-hover': '#047857',
        danger: '#DC2626',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
