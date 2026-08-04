import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        surface: '#ffffff',
        muted: '#64748b',
        border: '#dbe3ef',
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.22s ease-out both',
        'shrink-out': 'shrinkOut 0.3s ease-in-out both',
        'count-rise': 'countRise 0.26s ease-out both',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shrinkOut: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)', maxHeight: '999px' },
          '100%': { opacity: '0', transform: 'translateY(10px) scale(0.98)', maxHeight: '0', paddingTop: '0', paddingBottom: '0', marginTop: '0', marginBottom: '0' },
        },
        countRise: {
          '0%': { opacity: '0.3', transform: 'translateY(2px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      boxShadow: {
        card: '0 10px 30px rgba(15, 23, 42, 0.06)',
        drawer: '-20px 0 40px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config;
