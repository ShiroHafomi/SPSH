/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary - Indigo (Education/Trust)
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // Accent - Coral (Energy/Action)
        accent: {
          50: '#fff1ee',
          100: '#ffe0db',
          200: '#fcc3b7',
          300: '#f99682',
          400: '#f56a50',
          500: '#f14529',
          600: '#e53017',
          700: '#c42112',
          800: '#a01c13',
          900: '#821b14',
          950: '#450b09',
        },
        // Success - Emerald (Achievement)
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        // Warning - Amber (Caution)
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        // Danger - Red (Critical)
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },
        // Grade Colors
        grade: {
          a: '#059669',
          b: '#0284c7',
          c: '#d97706',
          d: '#ea580c',
          f: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Fira Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Fira Code', 'SF Mono', 'Monaco', 'Menlo', 'monospace'],
        display: ['Fira Sans', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.025em' }],
        'sm': ['0.875rem', { lineHeight: '1.5', letterSpacing: '0' }],
        'base': ['1rem', { lineHeight: '1.5', letterSpacing: '0' }],
        'lg': ['1.125rem', { lineHeight: '1.5', letterSpacing: '0' }],
        'xl': ['1.25rem', { lineHeight: '1.5', letterSpacing: '0' }],
        '2xl': ['1.5rem', { lineHeight: '1.33', letterSpacing: '-0.025em' }],
        '3xl': ['1.875rem', { lineHeight: '1.25', letterSpacing: '-0.025em' }],
        '4xl': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.025em' }],
        '5xl': ['3rem', { lineHeight: '1.15', letterSpacing: '-0.05em' }],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      boxShadow: {
        // Claymorphism shadows (double shadow for depth)
        'clay-sm': '4px 4px 8px rgba(99, 102, 241, 0.15), -4px -4px 8px rgba(255, 255, 255, 0.8)',
        'clay-md': '8px 8px 16px rgba(99, 102, 241, 0.18), -8px -8px 16px rgba(255, 255, 255, 0.9)',
        'clay-lg': '12px 12px 24px rgba(99, 102, 241, 0.2), -12px -12px 24px rgba(255, 255, 255, 0.95)',
        'clay-xl': '16px 16px 32px rgba(99, 102, 241, 0.22), -16px -16px 32px rgba(255, 255, 255, 0.95)',

        // Bento grid shadows
        'bento': '0 4px 6px -1px rgb(99 102 241 / 0.1), 0 2px 4px -2px rgb(99 102 241 / 0.1)',
        'bento-hover': '0 10px 15px -3px rgb(99 102 241 / 0.15), 0 4px 6px -4px rgb(99 102 241 / 0.15)',

        // Inner clay
        'clay-inner': 'inset 4px 4px 8px rgba(99, 102, 241, 0.1), inset -4px -4px 8px rgba(255, 255, 255, 0.8)',
      },
      animation: {
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'slide-down': 'slideDown 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-soft': 'pulse 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
        'slow': '300ms',
        'slower': '500ms',
      },
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
        'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
      },
      zIndex: {
        'hide': -1,
        'dropdown': 10,
        'sticky': 20,
        'fixed': 30,
        'modal-backdrop': 40,
        'modal': 50,
        'popover': 60,
        'tooltip': 70,
        'toast': 80,
      },
    },
  },
  plugins: [],
};