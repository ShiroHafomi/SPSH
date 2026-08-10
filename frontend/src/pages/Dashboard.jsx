import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFlash } from '../components/FlashProvider';
import { api } from '../api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Scatter, Line, Doughnut } from 'react-chartjs-2';
import { SkeletonCard, SkeletonChart } from '../components/Skeleton';
import { formatLabel } from '../utils/formatLabel';
import { useLanguage } from '../hooks/useLanguage';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/**
 * Professional color palette - WCAG AA compliant, colorblind-friendly
 * Based on UI/UX Pro Max chart guidelines for education analytics
 */
const CHART_THEME = {
  light: {
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
    grid: 'rgba(100, 116, 139, 0.08)',
    primary: {
      bg: 'rgba(99, 102, 241, 0.12)',
      border: 'rgb(99, 102, 241)',
      hover: 'rgba(99, 102, 241, 0.2)',
      solid: 'rgb(99, 102, 241)',
    },
    success: {
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgb(16, 185, 129)',
      hover: 'rgba(16, 185, 129, 0.2)',
      solid: 'rgb(16, 185, 129)',
    },
    warning: {
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgb(245, 158, 11)',
      hover: 'rgba(245, 158, 11, 0.2)',
      solid: 'rgb(245, 158, 11)',
    },
    danger: {
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgb(239, 68, 68)',
      hover: 'rgba(239, 68, 68, 0.2)',
      solid: 'rgb(239, 68, 68)',
    },
    info: {
      bg: 'rgba(6, 182, 212, 0.12)',
      border: 'rgb(6, 182, 212)',
      hover: 'rgba(6, 182, 212, 0.2)',
      solid: 'rgb(6, 182, 212)',
    },
  },
  dark: {
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    border: '#334155',
    grid: 'rgba(148, 163, 184, 0.12)',
    primary: {
      bg: 'rgba(99, 102, 241, 0.18)',
      border: 'rgb(129, 140, 248)',
      hover: 'rgba(99, 102, 241, 0.28)',
      solid: 'rgb(129, 140, 248)',
    },
    success: {
      bg: 'rgba(16, 185, 129, 0.18)',
      border: 'rgb(52, 211, 153)',
      hover: 'rgba(16, 185, 129, 0.28)',
      solid: 'rgb(52, 211, 153)',
    },
    warning: {
      bg: 'rgba(245, 158, 11, 0.18)',
      border: 'rgb(251, 191, 36)',
      hover: 'rgba(245, 158, 11, 0.28)',
      solid: 'rgb(251, 191, 36)',
    },
    danger: {
      bg: 'rgba(239, 68, 68, 0.18)',
      border: 'rgb(248, 113, 113)',
      hover: 'rgba(239, 68, 68, 0.28)',
      solid: 'rgb(248, 113, 113)',
    },
    info: {
      bg: 'rgba(6, 182, 212, 0.18)',
      border: 'rgb(56, 189, 248)',
      hover: 'rgba(6, 182, 212, 0.28)',
      solid: 'rgb(56, 189, 248)',
    },
  },
};

/**
 * Multi-series colors for grouped charts - distinct, accessible palette
 */
const MULTI_SERIES_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.18)', border: 'rgb(99, 102, 241)', solid: 'rgb(99, 102, 241)' },   // Indigo
  { bg: 'rgba(16, 185, 129, 0.18)', border: 'rgb(16, 185, 129)', solid: 'rgb(16, 185, 129)' },     // Emerald
  { bg: 'rgba(244, 114, 182, 0.18)', border: 'rgb(244, 114, 182)', solid: 'rgb(244, 114, 182)' },  // Pink
  { bg: 'rgba(245, 158, 11, 0.18)', border: 'rgb(245, 158, 11)', solid: 'rgb(245, 158, 11)' },     // Amber
  { bg: 'rgba(6, 182, 212, 0.18)', border: 'rgb(6, 182, 212)', solid: 'rgb(6, 182, 212)' },        // Cyan
  { bg: 'rgba(168, 85, 247, 0.18)', border: 'rgb(168, 85, 247)', solid: 'rgb(168, 85, 247)' },     // Purple
];

/**
 * Grade-specific colors for doughnut charts - semantic meaning preserved
 */
const GRADE_COLORS = {
  A: { bg: 'rgba(16, 185, 129, 0.85)', border: 'rgb(16, 185, 129)', solid: 'rgb(16, 185, 129)' },
  B: { bg: 'rgba(56, 189, 248, 0.85)', border: 'rgb(56, 189, 248)', solid: 'rgb(56, 189, 248)' },
  C: { bg: 'rgba(245, 158, 11, 0.85)', border: 'rgb(245, 158, 11)', solid: 'rgb(245, 158, 11)' },
  D: { bg: 'rgba(249, 115, 22, 0.85)', border: 'rgb(249, 115, 22)', solid: 'rgb(249, 115, 22)' },
  F: { bg: 'rgba(239, 68, 68, 0.85)', border: 'rgb(239, 68, 68)', solid: 'rgb(239, 68, 68)' },
};

/**
 * Get theme-aware Chart.js options
 */
const getChartOptions = (isDark) => {
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
          font: { size: 12, family: "'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", weight: 500 },
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
        titleFont: { size: 13, weight: '600', family: "'Fira Sans', sans-serif" },
        bodyFont: { size: 12, family: "'Fira Sans', sans-serif" },
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
          font: { size: 11, family: "'Fira Sans', sans-serif" },
          color: theme.textMuted,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 12,
        },
        title: {
          display: true,
          font: { size: 12, weight: '600', family: "'Fira Sans', sans-serif" },
          color: theme.textMuted,
          padding: { top: 12 },
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: theme.grid, drawBorder: false },
        ticks: {
          font: { size: 11, family: "'Fira Code', 'Monaco', 'Consolas', monospace" },
          color: theme.textMuted,
          callback: (value) => value % 1 === 0 ? value : '',
          padding: 12,
        },
        title: {
          display: true,
          font: { size: 12, weight: '600', family: "'Fira Sans', sans-serif" },
          color: theme.textMuted,
          padding: { bottom: 12 },
        },
      },
    },
    animation: {
      duration: 750,
      easing: 'easeOutQuart',
    },
    layout: { padding: { top: 8, right: 16, bottom: 8, left: 8 } },
  };
};

/**
 * Doughnut chart options for grade distribution
 */
const getDoughnutOptions = (isDark) => {
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
          font: { size: 12, family: "'Fira Sans', sans-serif", weight: 500 },
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
          label: (ctx) => `Grade ${ctx.label}: ${ctx.parsed}%`,
        },
      },
    },
    animation: { animateRotate: true, animateScale: true, duration: 1000, easing: 'easeOutQuart' },
    layout: { padding: { right: 24 } },
  };
};

/**
 * Scatter chart options
 */
const getScatterOptions = (isDark, xLabel, yLabel) => {
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

export default function Dashboard() {
  const { addFlash } = useFlash();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);
  const [kpis, setKpis] = useState([]);
  const [atRisk, setAtRisk] = useState(null);
  const [isDark, setIsDark] = useState(false);

  // Listen for dark mode changes
  useEffect(() => {
    const darkMode = document.documentElement.classList.contains('dark');
    setIsDark(darkMode);
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      setLoading(true);
      try {
        const [statsData, atRiskData] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/dashboard/at-risk').catch(() => null),
        ]);
        if (mounted) {
          setKpis(statsData.chartData.kpis);
          setChartData(statsData.chartData.charts);
          setAtRisk(atRiskData);
        }
      } catch (err) {
        if (mounted) addFlash(err.message, 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
    return () => { mounted = false; };
  }, [addFlash]);

  const formatKPI = (value, format) => {
    if (value === null || value === undefined) return '—';
    const num = Number(value);
    if (isNaN(num)) return value;
    if (format === 'pct') return num.toFixed(1) + '%';
    if (format === 'dec1') return num.toFixed(1);
    return num.toLocaleString();
  };

  // Transform chart data from API to Chart.js format
  const charts = useMemo(() => {
    if (!chartData) return [];
    return chartData.map((chart, idx) => {
      const seriesColor = MULTI_SERIES_COLORS[idx % MULTI_SERIES_COLORS.length];

      // Bar Chart - Compare Categories (sorted descending)
      if (chart.type === 'bar') {
        const sorted = chart.labels
          .map((label, i) => ({ label, value: chart.data[i] }))
          .filter(d => d.value !== null && d.value !== undefined)
          .sort((a, b) => b.value - a.value);

        return {
          ...chart,
          chartType: 'bar',
          data: {
            labels: sorted.map(d => formatLabel(d.label)),
            datasets: [{
              label: formatLabel(chart.yLabel || 'Value'),
              data: sorted.map(d => d.value),
              backgroundColor: seriesColor.bg,
              borderColor: seriesColor.border,
              borderWidth: 2,
              borderRadius: 8,
              borderSkipped: false,
              maxBarThickness: 52,
              hoverBackgroundColor: seriesColor.solid,
              hoverBorderColor: seriesColor.border,
            }],
          },
          options: getChartOptions(isDark),
        };
      }

      // Scatter Plot - Correlation/Distribution
      if (chart.type === 'scatter') {
        return {
          ...chart,
          chartType: 'scatter',
          data: {
            datasets: [{
              label: `${formatLabel(chart.yLabel)} vs ${formatLabel(chart.xLabel)}`,
              data: chart.data.map(d => ({ x: d.x, y: d.y })),
              backgroundColor: seriesColor.solid + 'B3', // 70% opacity
              borderColor: seriesColor.solid,
              borderWidth: 2,
              pointRadius: 7,
              pointHoverRadius: 9,
              pointBorderWidth: 2,
              pointBorderColor: isDark ? '#0f172a' : '#ffffff',
              pointStyle: 'circle',
            }],
          },
          options: getScatterOptions(isDark, chart.xLabel, chart.yLabel),
        };
      }

      // Line Chart - Trend Over Time
      if (chart.type === 'line') {
        return {
          ...chart,
          chartType: 'line',
          data: {
            labels: chart.labels.map(l => formatLabel(l)),
            datasets: [{
              label: formatLabel(chart.yLabel || 'Value'),
              data: chart.data,
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
              borderColor: 'rgb(99, 102, 241)',
              borderWidth: 3,
              fill: true,
              tension: 0.35,
              pointRadius: 5,
              pointHoverRadius: 8,
              pointBackgroundColor: 'rgb(99, 102, 241)',
              pointBorderColor: isDark ? '#0f172a' : '#ffffff',
              pointBorderWidth: 2,
              pointStyle: 'circle',
            }],
          },
          options: {
            ...getChartOptions(isDark),
            plugins: { ...getChartOptions(isDark).plugins, legend: { display: false } },
          },
        };
      }

      // Doughnut Chart - Part-to-Whole (Grade Distribution)
      if (chart.type === 'doughnut' || (chart.type === 'pie' && chart.labels?.some(l => ['A','B','C','D','F'].includes(l)))) {
        const backgrounds = chart.labels.map(l => GRADE_COLORS[l]?.bg || seriesColor.bg);
        const borders = chart.labels.map(l => GRADE_COLORS[l]?.border || seriesColor.border);

        return {
          ...chart,
          chartType: 'doughnut',
          data: {
            labels: chart.labels.map(l => `Grade ${l}`),
            datasets: [{
              data: chart.data,
              backgroundColor: backgrounds,
              borderColor: borders,
              borderWidth: 3,
              borderAlign: 'inner',
              hoverOffset: 10,
              hoverBorderWidth: 4,
            }],
          },
          options: getDoughnutOptions(isDark),
        };
      }

      // Default fallback - Bar chart
      return {
        ...chart,
        chartType: 'bar',
        data: {
          labels: chart.labels.map(l => formatLabel(l)),
          datasets: [{
            label: formatLabel(chart.yLabel || 'Value'),
            data: chart.data,
            backgroundColor: seriesColor.bg,
            borderColor: seriesColor.border,
            borderWidth: 2,
            borderRadius: 6,
          }],
        },
        options: getChartOptions(isDark),
      };
    });
  }, [chartData, isDark]);

  // KPI Cards configuration
  const icons = [
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg>,
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  ];
  const gradients = ['from-indigo-500 to-purple-500', 'from-emerald-500 to-teal-400', 'from-pink-500 to-rose-400', 'from-indigo-600 to-purple-500'];

  const cards = useMemo(() => {
    const atRiskCount = atRisk && typeof atRisk.count === 'number' ? atRisk.count : 0;
    const list = [];
    kpis.forEach((kpi) => {
      const isTotal = kpi.key === 'total';
      list.push({ ...kpi, featured: isTotal, to: isTotal ? '/students' : undefined });
      if (isTotal) {
        list.push({
          label: t('dashboard.atRiskCard'),
          key: 'at_risk',
          value: atRiskCount,
          format: 'int',
          to: '/students?at_risk=1',
          featured: true,
          danger: true,
        });
      }
    });
    return list;
  }, [kpis, atRisk, t]);

  if (loading) {
    return (
      <div className="space-y-8" aria-busy="true" aria-label="Loading dashboard">
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[...Array(3)].map((_, i) => <SkeletonChart key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8" role="main">
      {/* KPI Cards */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" role="region" aria-label="Key Metrics">
        {cards.map((card, idx) => {
          if (card.featured) {
            return (
              <Link
                key={card.key || idx}
                to={card.to}
                className={`kpi-card group relative overflow-hidden rounded-2xl transition-all duration-300 ${
                  card.danger
                    ? 'bg-linear-to-br from-red-500 to-amber-500'
                    : 'bg-linear-to-br from-indigo-600 to-purple-500'
                }`}
                aria-label={card.label}
              >
                <div className="flex items-start justify-between p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-white/75 group-hover:text-white transition-colors">
                    {card.label}
                  </p>
                  <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center text-white flex-shrink-0 group-hover:bg-white/25 transition-colors">
                    {card.danger ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    )}
                  </div>
                </div>
                <p className="px-5 text-4xl font-extrabold text-white tabular-nums font-mono tracking-tight">
                  {formatKPI(card.value, card.format)}
                </p>
                <span className="inline-flex items-center gap-1 px-5 pb-4 text-sm font-semibold text-white/90 group-hover:text-white transition-colors">
                  {t('dashboard.viewAll')}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                </span>
              </Link>
            );
          }
          const iconIdx = idx < 4 ? idx : idx - 1;
          return (
            <div
              key={card.key || idx}
              className="kpi-card group bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all duration-300 p-5"
            >
              <div className="flex items-start justify-between">
                <p className="kpi-label text-sm font-medium text-slate-500 dark:text-slate-400 capitalize">{card.label}</p>
                <div className={`kpi-icon-box rounded-xl bg-linear-to-br ${card.gradient || gradients[iconIdx % 4]} text-white shadow-lg size-11 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                  {icons[iconIdx % 4]}
                </div>
              </div>
              <p className="kpi-value mt-3 text-3xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                {formatKPI(card.value, card.format)}
              </p>
            </div>
          );
        })}
      </div>

      {/* At-Risk Students Warning */}
      {atRisk && atRisk.count > 0 && (
        <div
          className="relative rounded-2xl border-l-4 border-red-500 bg-red-50/60 dark:bg-red-950/20 p-5"
          role="alert"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-1">
                <div className="size-10 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                </div>
                <h3 className="text-lg font-semibold text-red-700 dark:text-red-400">
                  {atRisk.count} {atRisk.count === 1 ? t('dashboard.studentSingular') : t('dashboard.studentPlural')} {t('dashboard.atRiskLabel')}
                </h3>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400/80 mb-3 ml-12">
                {t('dashboard.atRiskMessage', {
                  att: atRisk.thresholds?.attendance || 75,
                  hrs: atRisk.thresholds?.studyHours || 2,
                  gpa: atRisk.thresholds?.gpa || 2.5,
                })}
              </p>
              <div className="flex flex-wrap gap-1.5 ml-12">
                {atRisk.students.slice(0, 8).map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white dark:bg-gray-800 text-indigo-700 dark:text-slate-300 rounded-lg border border-indigo-100 dark:border-gray-700"
                  >
                    #{s.id}
                  </span>
                ))}
                {atRisk.students.length > 8 && (
                  <span className="text-xs text-indigo-400 dark:text-slate-500 px-2.5 py-1 flex items-center">
                    +{atRisk.students.length - 8} {t('dashboard.more')}
                  </span>
                )}
              </div>
            </div>
            <Link
              to="/students?at_risk=1"
              className="btn-danger flex-shrink-0 whitespace-nowrap"
              aria-label={t('dashboard.viewAtRiskStudents')}
            >
              {t('dashboard.viewStudents')}
            </Link>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2" role="region" aria-label="Analytics Charts">
        {charts.map((chart, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm overflow-hidden p-6"
          >
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {formatLabel(chart.title)}
              </h3>
              {chart.xLabel && chart.yLabel && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-medium">
                  <span className="truncate max-w-[100px]">{formatLabel(chart.xLabel)}</span>
                  <svg className="w-3 h-3 flex-shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  <span className="truncate max-w-[100px]">{formatLabel(chart.yLabel)}</span>
                </span>
              )}
            </div>
            <div className="chart-container" style={{ height: '360px', position: 'relative' }}>
              {chart.chartType === 'bar' && <Bar data={chart.data} options={chart.options} />}
              {chart.chartType === 'scatter' && <Scatter data={chart.data} options={chart.options} />}
              {chart.chartType === 'line' && <Line data={chart.data} options={chart.options} />}
              {chart.chartType === 'doughnut' && <Doughnut data={chart.data} options={chart.options} />}
            </div>
          </div>
        ))}

        {!charts.length && (
          <div className="col-span-full text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800">
            <svg className="w-16 h-16 mx-auto text-slate-200 dark:text-slate-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            <p className="text-slate-400 dark:text-slate-500 font-medium text-lg">{t('dashboard.noChartData')}</p>
            <p className="text-sm text-slate-300 dark:text-slate-600 mt-2 max-w-xs mx-auto">
              {t('dashboard.noChartDataDesc')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}