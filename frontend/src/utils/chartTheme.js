import { formatLabel } from './formatLabel.js';

const FIRA_SANS = "'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FIRA_MONO = "'Fira Code', 'Monaco', 'Consolas', monospace";

export const CHART_THEME = {
  light: {
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textMuted: '#475569',
    border: '#cbd5e1',
    grid: 'rgba(100, 116, 139, 0.12)',
    primary: { bg: 'rgba(37, 99, 235, 0.12)', border: '#2563eb', hover: 'rgba(37, 99, 235, 0.2)', solid: '#2563eb' },
    success: { bg: 'rgba(21, 128, 61, 0.12)', border: '#15803d', hover: 'rgba(21, 128, 61, 0.2)', solid: '#15803d' },
    warning: { bg: 'rgba(180, 83, 9, 0.12)', border: '#b45309', hover: 'rgba(180, 83, 9, 0.2)', solid: '#b45309' },
    danger: { bg: 'rgba(185, 28, 28, 0.12)', border: '#b91c1c', hover: 'rgba(185, 28, 28, 0.2)', solid: '#b91c1c' },
    info: { bg: 'rgba(15, 118, 110, 0.12)', border: '#0f766e', hover: 'rgba(15, 118, 110, 0.2)', solid: '#0f766e' },
  },
  dark: {
    background: '#111827',
    surface: '#1e293b',
    text: '#f8fafc',
    textMuted: '#cbd5e1',
    border: '#334155',
    grid: 'rgba(148, 163, 184, 0.16)',
    primary: { bg: 'rgba(96, 165, 250, 0.16)', border: '#60a5fa', hover: 'rgba(96, 165, 250, 0.26)', solid: '#60a5fa' },
    success: { bg: 'rgba(74, 222, 128, 0.16)', border: '#4ade80', hover: 'rgba(74, 222, 128, 0.26)', solid: '#4ade80' },
    warning: { bg: 'rgba(251, 191, 36, 0.16)', border: '#fbbf24', hover: 'rgba(251, 191, 36, 0.26)', solid: '#fbbf24' },
    danger: { bg: 'rgba(248, 113, 113, 0.16)', border: '#f87171', hover: 'rgba(248, 113, 113, 0.26)', solid: '#f87171' },
    info: { bg: 'rgba(45, 212, 191, 0.16)', border: '#2dd4bf', hover: 'rgba(45, 212, 191, 0.26)', solid: '#2dd4bf' },
  },
};

const CATEGORICAL_PALETTES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function getMultiSeriesColors(isDark = false) {
  return CATEGORICAL_PALETTES[isDark ? 'dark' : 'light'].map((solid) => ({
    bg: hexToRgba(solid, 0.16),
    border: solid,
    solid,
  }));
}

export const MULTI_SERIES_COLORS = getMultiSeriesColors(false);

export const GRADE_COLORS = {
  A: { bg: 'rgba(16, 185, 129, 0.85)', border: 'rgb(16, 185, 129)', solid: 'rgb(16, 185, 129)' },
  B: { bg: 'rgba(56, 189, 248, 0.85)', border: 'rgb(56, 189, 248)', solid: 'rgb(56, 189, 248)' },
  C: { bg: 'rgba(245, 158, 11, 0.85)', border: 'rgb(245, 158, 11)', solid: 'rgb(245, 158, 11)' },
  D: { bg: 'rgba(249, 115, 22, 0.85)', border: 'rgb(249, 115, 22)', solid: 'rgb(249, 115, 22)' },
  F: { bg: 'rgba(239, 68, 68, 0.85)', border: 'rgb(239, 68, 68)', solid: 'rgb(239, 68, 68)' },
};

export const GRADE_BADGE_CLASSES = {
  A: 'grade-a',
  B: 'grade-b',
  C: 'grade-c',
  D: 'grade-d',
  F: 'grade-f',
};

export const getGradeBadgeClass = (grade) => GRADE_BADGE_CLASSES[grade] || 'badge-gray';

function getDocumentLocale() {
  if (typeof document === 'undefined') return 'en';
  return document.documentElement.lang || 'en';
}

export function formatChartValue(value, locale = getDocumentLocale()) {
  if (typeof value !== 'number') return value == null ? '' : String(value);
  if (!Number.isFinite(value)) return '—';

  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  } catch {
    return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
  }
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getChartAnimation(reduceMotion = prefersReducedMotion()) {
  return reduceMotion ? false : { duration: 500, easing: 'easeOutQuart' };
}

function getTooltipLabel(ctx) {
  const label = ctx.dataset.label || '';
  const parsed = ctx.parsed;
  const value = parsed && typeof parsed === 'object'
    ? (parsed.y ?? parsed.x)
    : parsed;
  const formattedValue = formatChartValue(value);
  return label ? `${label}: ${formattedValue}` : formattedValue;
}

function getLegendOptions(theme, position = 'top') {
  return {
    display: true,
    position,
    align: 'start',
    labels: {
      usePointStyle: true,
      pointStyle: 'circle',
      boxWidth: 8,
      boxHeight: 8,
      padding: 16,
      font: { size: 12, family: FIRA_SANS, weight: 500 },
      color: theme.textMuted,
    },
  };
}

function getTooltipOptions(isDark, theme, labelCallback = getTooltipLabel) {
  return {
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.98)' : 'rgba(255, 255, 255, 0.98)',
    titleColor: theme.text,
    bodyColor: theme.textMuted,
    borderColor: theme.border,
    borderWidth: 1,
    cornerRadius: 8,
    displayColors: true,
    usePointStyle: true,
    padding: 12,
    titleFont: { size: 13, weight: '600', family: FIRA_SANS },
    bodyFont: { size: 12, family: FIRA_SANS },
    callbacks: { label: labelCallback },
  };
}

function getNumericScale(theme) {
  return {
    beginAtZero: true,
    grid: { color: theme.grid, drawBorder: false, lineWidth: 1 },
    border: { display: false },
    ticks: {
      font: { size: 11, family: FIRA_MONO },
      color: theme.textMuted,
      callback: (value) => formatChartValue(Number(value)),
      maxTicksLimit: 6,
      padding: 10,
    },
    title: {
      display: false,
      font: { size: 12, weight: '600', family: FIRA_SANS },
      color: theme.textMuted,
      padding: { bottom: 10 },
    },
  };
}

function getCategoryScale(theme) {
  return {
    grid: { display: false, drawBorder: false },
    border: { display: false },
    ticks: {
      font: { size: 11, family: FIRA_SANS },
      color: theme.textMuted,
      maxRotation: 0,
      autoSkip: true,
      maxTicksLimit: 12,
      padding: 8,
    },
    title: {
      display: false,
      font: { size: 12, weight: '600', family: FIRA_SANS },
      color: theme.textMuted,
      padding: { top: 10 },
    },
  };
}

export const getChartOptions = (isDark) => {
  const theme = isDark ? CHART_THEME.dark : CHART_THEME.light;
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: getLegendOptions(theme),
      tooltip: getTooltipOptions(isDark, theme),
    },
    scales: {
      x: getCategoryScale(theme),
      y: getNumericScale(theme),
    },
    elements: {
      bar: {
        borderRadius: 4,
        borderSkipped: 'start',
      },
      line: {
        borderWidth: 2,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        tension: 0.25,
      },
      point: {
        radius: 4,
        hoverRadius: 6,
        hitRadius: 12,
        borderWidth: 2,
        borderColor: theme.background,
      },
    },
    datasets: {
      bar: {
        maxBarThickness: 24,
        categoryPercentage: 0.78,
        barPercentage: 0.8,
      },
    },
    animation: getChartAnimation(),
    layout: { padding: { top: 6, right: 10, bottom: 6, left: 4 } },
  };
};

export const getDoughnutOptions = (isDark, labelCallback) => {
  const theme = isDark ? CHART_THEME.dark : CHART_THEME.light;
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '66%',
    plugins: {
      legend: getLegendOptions(theme, 'bottom'),
      tooltip: getTooltipOptions(
        isDark,
        theme,
        labelCallback || ((ctx) => `${ctx.label}: ${formatChartValue(ctx.parsed)}%`),
      ),
    },
    animation: getChartAnimation(),
    layout: { padding: 8 },
  };
};

export const getHorizontalBarOptions = (isDark, xTitle = 'Average Score') => {
  const base = getChartOptions(isDark);
  return {
    ...base,
    indexAxis: 'y',
    plugins: { ...base.plugins, legend: { ...base.plugins.legend, display: false } },
    scales: {
      x: {
        ...base.scales.y,
        title: {
          ...base.scales.y.title,
          display: Boolean(xTitle),
          text: formatLabel(xTitle),
        },
      },
      y: {
        ...base.scales.x,
        title: { ...base.scales.x.title, display: false },
      },
    },
  };
};

export const getScatterOptions = (isDark, xLabel, yLabel) => {
  const base = getChartOptions(isDark);
  const theme = isDark ? CHART_THEME.dark : CHART_THEME.light;
  const numericScale = getNumericScale(theme);
  return {
    ...base,
    interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
    plugins: { ...base.plugins, legend: { ...base.plugins.legend, display: false } },
    scales: {
      x: {
        ...numericScale,
        title: { ...numericScale.title, display: Boolean(xLabel), text: formatLabel(xLabel) },
      },
      y: {
        ...numericScale,
        title: { ...numericScale.title, display: Boolean(yLabel), text: formatLabel(yLabel) },
      },
    },
  };
};
