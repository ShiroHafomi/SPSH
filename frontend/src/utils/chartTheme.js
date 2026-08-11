/**
 * Shared Chart.js theme + option builders.
 *
 * Single source of truth for every Chart.js chart in the app so light/dark
 * mode, color palette, fonts, and tooltip styling stay consistent across
 * Dashboard, TeacherDashboard, AdminDashboard and any other chart-bearing page.
 *
 * Palette is WCAG-AA compliant and colorblind-friendly.
 *
 * Usage:
 *   import { getChartOptions, getDoughnutOptions, getScatterOptions,
 *            getHorizontalBarOptions, MULTI_SERIES_COLORS, GRADE_COLORS } from '../utils/chartTheme';
 *   const { isDark } = useTheme();
 *   <Bar data={data} options={getChartOptions(isDark)} />
 */
import { formatLabel } from './formatLabel';

const FIRA_SANS = "'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FIRA_MONO = "'Fira Code', 'Monaco', 'Consolas', monospace";

/**
 * Professional color palette - WCAG AA compliant, colorblind-friendly.
 */
export const CHART_THEME = {
  light: {
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
    grid: 'rgba(100, 116, 139, 0.08)',
    primary: { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgb(99, 102, 241)', hover: 'rgba(99, 102, 241, 0.2)', solid: 'rgb(99, 102, 241)' },
    success: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgb(16, 185, 129)', hover: 'rgba(16, 185, 129, 0.2)', solid: 'rgb(16, 185, 129)' },
    warning: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgb(245, 158, 11)', hover: 'rgba(245, 158, 11, 0.2)', solid: 'rgb(245, 158, 11)' },
    danger: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgb(239, 68, 68)', hover: 'rgba(239, 68, 68, 0.2)', solid: 'rgb(239, 68, 68)' },
    info: { bg: 'rgba(6, 182, 212, 0.12)', border: 'rgb(6, 182, 212)', hover: 'rgba(6, 182, 212, 0.2)', solid: 'rgb(6, 182, 212)' },
  },
  dark: {
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    border: '#334155',
    grid: 'rgba(148, 163, 184, 0.12)',
    primary: { bg: 'rgba(99, 102, 241, 0.18)', border: 'rgb(129, 140, 248)', hover: 'rgba(99, 102, 241, 0.28)', solid: 'rgb(129, 140, 248)' },
    success: { bg: 'rgba(16, 185, 129, 0.18)', border: 'rgb(52, 211, 153)', hover: 'rgba(16, 185, 129, 0.28)', solid: 'rgb(52, 211, 153)' },
    warning: { bg: 'rgba(245, 158, 11, 0.18)', border: 'rgb(251, 191, 36)', hover: 'rgba(245, 158, 11, 0.28)', solid: 'rgb(251, 191, 36)' },
    danger: { bg: 'rgba(239, 68, 68, 0.18)', border: 'rgb(248, 113, 113)', hover: 'rgba(239, 68, 68, 0.28)', solid: 'rgb(248, 113, 113)' },
    info: { bg: 'rgba(6, 182, 212, 0.18)', border: 'rgb(56, 189, 248)', hover: 'rgba(6, 182, 212, 0.28)', solid: 'rgb(56, 189, 248)' },
  },
};

/**
 * Multi-series colors for grouped charts - distinct, accessible palette.
 */
export const MULTI_SERIES_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.18)', border: 'rgb(99, 102, 241)', solid: 'rgb(99, 102, 241)' },   // Indigo
  { bg: 'rgba(16, 185, 129, 0.18)', border: 'rgb(16, 185, 129)', solid: 'rgb(16, 185, 129)' },    // Emerald
  { bg: 'rgba(244, 114, 182, 0.18)', border: 'rgb(244, 114, 182)', solid: 'rgb(244, 114, 182)' },  // Pink
  { bg: 'rgba(245, 158, 11, 0.18)', border: 'rgb(245, 158, 11)', solid: 'rgb(245, 158, 11)' },     // Amber
  { bg: 'rgba(6, 182, 212, 0.18)', border: 'rgb(6, 182, 212)', solid: 'rgb(6, 182, 212)' },        // Cyan
  { bg: 'rgba(168, 85, 247, 0.18)', border: 'rgb(168, 85, 247)', solid: 'rgb(168, 85, 247)' },     // Purple
];

/**
 * Grade-specific colors for doughnut/bar charts - semantic meaning preserved.
 */
export const GRADE_COLORS = {
  A: { bg: 'rgba(16, 185, 129, 0.85)', border: 'rgb(16, 185, 129)', solid: 'rgb(16, 185, 129)' },
  B: { bg: 'rgba(56, 189, 248, 0.85)', border: 'rgb(56, 189, 248)', solid: 'rgb(56, 189, 248)' },
  C: { bg: 'rgba(245, 158, 11, 0.85)', border: 'rgb(245, 158, 11)', solid: 'rgb(245, 158, 11)' },
  D: { bg: 'rgba(249, 115, 22, 0.85)', border: 'rgb(249, 115, 22)', solid: 'rgb(249, 115, 22)' },
  F: { bg: 'rgba(239, 68, 68, 0.85)', border: 'rgb(239, 68, 68)', solid: 'rgb(239, 68, 68)' },
};

/**
 * Get theme-aware base Chart.js options (vertical bar / line).
 * @param {boolean} isDark
 */
export const getChartOptions = (isDark) => {
  const theme = isDark ? CHART_THEME.dark : CHART_THEME.light;
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
          font: { size: 12, family: FIRA_SANS, weight: 500 },
          color: theme.textMuted,
        },
      },
      tooltip: {
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.96)',
        titleColor: theme.text,
        bodyColor: theme.textMuted,
        borderColor: theme.border,
        borderWidth: 1,
        cornerRadius: 10,
        displayColors: true,
        padding: 14,
        titleFont: { size: 13, weight: '600', family: FIRA_SANS },
        bodyFont: { size: 12, family: FIRA_SANS },
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset.label || '';
            const value = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed;
            return `${label}: ${typeof value === 'number' ? value.toLocaleString() : value}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false, color: theme.grid },
        ticks: {
          font: { size: 11, family: FIRA_SANS },
          color: theme.textMuted,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 12,
        },
        title: {
          display: true,
          font: { size: 12, weight: '600', family: FIRA_SANS },
          color: theme.textMuted,
          padding: { top: 12 },
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: theme.grid, drawBorder: false },
        ticks: {
          font: { size: 11, family: FIRA_MONO },
          color: theme.textMuted,
          callback: (value) => (value % 1 === 0 ? value : ''),
          padding: 12,
        },
        title: {
          display: true,
          font: { size: 12, weight: '600', family: FIRA_SANS },
          color: theme.textMuted,
          padding: { bottom: 12 },
        },
      },
    },
    animation: { duration: 750, easing: 'easeOutQuart' },
    layout: { padding: { top: 8, right: 16, bottom: 8, left: 8 } },
  };
};

/**
 * Doughnut chart options (grade distribution etc.).
 * @param {boolean} isDark
 * @param {(ctx:any)=>string} [labelCallback] - optional custom tooltip label
 */
export const getDoughnutOptions = (isDark, labelCallback) => {
  const theme = isDark ? CHART_THEME.dark : CHART_THEME.light;
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 18,
          font: { size: 12, family: FIRA_SANS, weight: 500 },
          color: theme.text,
        },
      },
      tooltip: {
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.96)',
        titleColor: theme.text,
        bodyColor: theme.textMuted,
        borderColor: theme.border,
        borderWidth: 1,
        cornerRadius: 10,
        padding: 14,
        callbacks: {
          label: labelCallback || ((ctx) => `Grade ${ctx.label}: ${ctx.parsed}%`),
        },
      },
    },
    animation: { animateRotate: true, animateScale: true, duration: 1000, easing: 'easeOutQuart' },
    layout: { padding: { right: 24 } },
  };
};

/**
 * Horizontal bar chart options (sleep impact, part-time impact, etc.).
 * @param {boolean} isDark
 * @param {string} [xTitle] - x-axis title (defaults to "Average Score")
 */
export const getHorizontalBarOptions = (isDark, xTitle = 'Average Score') => {
  const base = getChartOptions(isDark);
  const theme = isDark ? CHART_THEME.dark : CHART_THEME.light;
  return {
    ...base,
    indexAxis: 'y',
    plugins: { ...base.plugins, legend: { ...base.plugins.legend, display: false } },
    scales: {
      x: { ...base.scales.x, beginAtZero: true, title: { ...base.scales.x.title, text: formatLabel(xTitle) } },
      y: {
        ...base.scales.y,
        title: {
          display: true,
          font: { size: 12, weight: '600', family: FIRA_SANS },
          color: theme.textMuted,
          padding: { bottom: 12 },
        },
      },
    },
  };
};

/**
 * Scatter chart options (correlation/distribution).
 * @param {boolean} isDark
 * @param {string} xLabel
 * @param {string} yLabel
 */
export const getScatterOptions = (isDark, xLabel, yLabel) => {
  const base = getChartOptions(isDark);
  return {
    ...base,
    plugins: { ...base.plugins, legend: { display: false } },
    scales: {
      ...base.scales,
      x: { ...base.scales.x, title: { ...base.scales.x.title, text: formatLabel(xLabel) }, beginAtZero: true },
      y: { ...base.scales.y, title: { ...base.scales.y.title, text: formatLabel(yLabel) }, beginAtZero: true },
    },
  };
};
