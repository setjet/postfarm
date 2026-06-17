/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.5s ease',
        shimmer: 'shimmer 1.8s linear infinite',
      },
      boxShadow: {
        main: 'var(--shadow-main)',
        field: 'var(--shadow-field)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        bg:         'var(--bg)',
        surface:    'var(--surface)',
        card:       'var(--card)',
        raised:     'var(--raised)',
        control:    'var(--control)',
        ink:        'var(--ink)',
        'ink-2':    'var(--ink-2)',
        'ink-3':    'var(--ink-3)',
        'ink-4':    'var(--ink-4)',
        'ink-5':    'var(--ink-5)',
        'ink-6':    'var(--ink-6)',
        'ink-7':    'var(--ink-7)',
        'ink-8':    'var(--ink-8)',
        'ink-hover':'var(--ink-hover)',
        line:       'var(--line)',
        'line-2':   'var(--line-2)',
        accent:     'var(--accent)',
        success:    'var(--success)',
        warning:    'var(--warning)',
        danger:     'var(--danger)',
      },
    },
  },
  plugins: [],
}
