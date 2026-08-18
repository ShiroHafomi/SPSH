/**
 * Design System Tokens for Student Performance & Study Habits
 * Style: Bento Box Grid + Claymorphism (Education)
 * Palette: Indigo primary, Coral accent, Emerald success
 */

export const designTokens = {
  // Color Palette
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
    // Neutral - Slate (UI)
    neutral: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
  },

  // Typography
  typography: {
    fontFamilies: {
      sans: ['Fira Sans', 'system-ui', '-apple-system', 'sans-serif'],
      mono: ['Fira Code', 'SF Mono', 'Monaco', 'Menlo', 'monospace'],
      display: ['Fira Sans', 'system-ui', '-apple-system', 'sans-serif'],
    },
    fontSizes: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem', // 36px
      '5xl': '3rem',    // 48px
    },
    fontWeights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
    lineHeights: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
    letterSpacing: {
      tighter: '-0.05em',
      tight: '-0.025em',
      normal: '0',
      wide: '0.025em',
      wider: '0.05em',
      widest: '0.1em',
    },
  },

  // Spacing Scale (4px base)
  spacing: {
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
    20: '5rem',     // 80px
    24: '6rem',     // 96px,
  },

  // Border Radius
  borderRadius: {
    none: '0',
    sm: '0.375rem',   // 6px
    DEFAULT: '0.5rem', // 8px
    md: '0.75rem',    // 12px
    lg: '1rem',       // 16px
    xl: '1.5rem',     // 24px
    '2xl': '2rem',    // 32px
    full: '9999px',
  },

  // Shadows (Claymorphism)
  shadows: {
    // Bento grid shadows
    bento: '0 4px 6px -1px rgb(99 102 241 / 0.1), 0 2px 4px -2px rgb(99 102 241 / 0.1)',
    'bento-hover': '0 10px 15px -3px rgb(99 102 241 / 0.15), 0 4px 6px -4px rgb(99 102 241 / 0.15)',

    // Claymorphism shadows (double shadow for depth)
    'clay-sm': '4px 4px 8px rgba(99, 102, 241, 0.15), -4px -4px 8px rgba(255, 255, 255, 0.8)',
    'clay-md': '8px 8px 16px rgba(99, 102, 241, 0.18), -8px -8px 16px rgba(255, 255, 255, 0.9)',
    'clay-lg': '12px 12px 24px rgba(99, 102, 241, 0.2), -12px -12px 24px rgba(255, 255, 255, 0.95)',

    // Standard shadows
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  },

  // Transitions
  transitions: {
    duration: {
      fast: '150ms',
      normal: '200ms',
      slow: '300ms',
      slower: '500ms',
    },
    easing: {
      easeOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  },

  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  // Z-Index Scale
  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 10,
    sticky: 20,
    fixed: 30,
    modalBackdrop: 40,
    modal: 50,
    popover: 60,
    tooltip: 70,
    toast: 80,
  },

  // Chart Colors (Accessible)
  chartColors: {
    multiSeries: [
      { bg: 'rgba(99, 102, 241, 0.15)', border: 'rgb(99, 102, 241)', solid: 'rgb(99, 102, 241)' },
      { bg: 'rgba(241, 69, 41, 0.15)', border: 'rgb(241, 69, 41)', solid: 'rgb(241, 69, 41)' },
      { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgb(16, 185, 129)', solid: 'rgb(16, 185, 129)' },
      { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgb(245, 158, 11)', solid: 'rgb(245, 158, 11)' },
      { bg: 'rgba(139, 92, 246, 0.15)', border: 'rgb(139, 92, 246)', solid: 'rgb(139, 92, 246)' },
      { bg: 'rgba(236, 72, 153, 0.15)', border: 'rgb(236, 72, 153)', solid: 'rgb(236, 72, 153)' },
    ],
    grades: {
      A: { bg: 'rgba(16, 185, 129, 0.2)', border: 'rgb(16, 185, 129)' },
      B: { bg: 'rgba(14, 165, 233, 0.2)', border: 'rgb(14, 165, 233)' },
      C: { bg: 'rgba(245, 158, 11, 0.2)', border: 'rgb(245, 158, 11)' },
      D: { bg: 'rgba(249, 115, 22, 0.2)', border: 'rgb(249, 115, 22)' },
      F: { bg: 'rgba(239, 68, 68, 0.2)', border: 'rgb(239, 68, 68)' },
    },
  },

  // Component Sizes
  componentSizes: {
    button: {
      sm: { px: '0.75rem', py: '0.375rem', text: '0.75rem', gap: '0.375rem', radius: '0.5rem' },
      DEFAULT: { px: '1rem', py: '0.625rem', text: '0.875rem', gap: '0.5rem', radius: '0.75rem' },
      lg: { px: '1.5rem', py: '0.75rem', text: '1rem', gap: '0.5rem', radius: '1rem' },
      icon: { size: '2.25rem', radius: '0.75rem' },
    },
    input: {
      sm: { px: '0.75rem', py: '0.375rem', text: '0.875rem', radius: '0.5rem' },
      DEFAULT: { px: '1rem', py: '0.625rem', text: '0.875rem', radius: '0.75rem' },
      lg: { px: '1rem', py: '0.75rem', text: '1rem', radius: '1rem' },
    },
    card: {
      padding: {
        sm: '1rem',
        DEFAULT: '1.5rem',
        lg: '2rem',
      },
    },
  },

  // Animation Keyframes (as strings for CSS-in-JS)
  keyframes: {
    shimmer: `
      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `,
    slideDown: `
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `,
    slideUp: `
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `,
    fadeIn: `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `,
    scaleIn: `
      @keyframes scaleIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
    `,
    pulse: `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `,
  },
};

// Helper functions
export const getColor = (colorScale, shade) => {
  const colors = designTokens.colors[colorScale];
  return colors?.[shade] || colors?.[500] || '#6366f1';
};

export const getShadow = (shadowName) => designTokens.shadows[shadowName] || designTokens.shadows.DEFAULT;

export const getSpacing = (value) => designTokens.spacing[value] || `${value}rem`;

export const getFontSize = (size) => designTokens.typography.fontSizes[size] || designTokens.typography.fontSizes.base;

export const getTransition = (property = 'all', duration = 'normal', easing = 'easeOut') => {
  return `${property} ${designTokens.transitions.duration[duration]} ${designTokens.transitions.easing[easing]}`;
};

export default designTokens;