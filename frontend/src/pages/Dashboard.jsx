import { useEffect, useState, useMemo } from 'react';
import { useFlash } from '../components/FlashProvider';
import { api } from '../api';
import { Chart, registerables } from 'chart.js';
import { Bar, Scatter, Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { SkeletonCard, SkeletonChart } from '../components/Skeleton';

ChartJS.register(...registerables);

// Professional chart color palette - accessible, colorblind-friendly
const CHART_COLORS = {
  primary: {
    bg: 'rgba(99, 102, 241, 0.7)',
    border: 'rgb(99, 102, 241)',
    hover: 'rgba(99, 102, 241, 0.9)',
  },
  success: {
    bg: 'rgba(16, 185, 129, 0.7)',
    border: 'rgb(16, 185, 129)',
    hover: 'rgba(16, 185, 129, 0.9)',
  },
  accent: {
    bg: 'rgba(244, 114, 182, 0.7)',
    border: 'rgb(244, 114, 182)',
    hover: 'rgba(244, 114, 182, 0.9)',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.7)',
    border: 'rgb(245, 158, 11)',
    hover: 'rgba(245, 158, 11, 0.9)',
  },
  danger: {
    bg: 'rgba(239, 68, 68, 0.7)',
    border: 'rgb(239, 68, 68)',
    hover: 'rgba(239, 68, 68, 0.9)',
  },
  info: {
    bg: 'rgba(6, 182, 212, 0.7)',
    border: 'rgb(6, 182, 212)',
    hover: 'rgba(6, 182, 212, 0.9)',
  },
};

// Multi-series palette for grouped charts
const MULTI_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.7)', border: 'rgb(99, 102, 241)' },
  { bg: 'rgba(16, 185, 129, 0.7)', border: 'rgb(16, 185, 129)' },
  { bg: 'rgba(244, 114, 182, 0.7)', border: 'rgb(244, 114, 182)' },
  { bg: 'rgba(245, 158, 11, 0.7)', border: 'rgb(245, 158, 11)' },
  { bg: 'rgba(6, 182, 212, 0.7)', border: 'rgb(6, 182, 212)' },
  { bg: 'rgba(168, 85, 247, 0.7)', border: 'rgb(168, 85, 247)' },
];

const getChartOptions = (isDark) => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      labels: {
        usePointStyle: true,
        padding: 20,
        font: { size: 12, family: "'Fira Sans', sans-serif" },
        color: isDark ? '#e2e8f0' : '#1e293b',
      },
    },
    tooltip: {
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      titleColor: isDark ? '#f1f5f9' : '#0f172a',
      bodyColor: isDark ? '#cbd5e1' : '#334155',
      borderColor: isDark ? '#334155' : '#e2e8f0',
      borderWidth: 1,
      cornerRadius: 8,
      displayColors: true,
      padding: 12,
      titleFont: { size: 13, weight: '600', family: "'Fira Sans', sans-serif" },
      bodyFont: { size: 12, family: "'Fira Sans', sans-serif" },
    },
  },
  scales: {
    x: {
      grid: { display: false, drawBorder: false },
      ticks: {
        font: { size: 11, family: "'Fira Sans', sans-serif" },
        color: isDark ? '#94a3b8' : '#64748b',
        maxRotation: 0,
      },
      title: { display: true, font: { size: 12, weight: '600', family: "'Fira Sans', sans-serif" }, color: isDark ? '#94a3b8' : '#64748b' },
    },
    y: {
      beginAtZero: true,
      grid: { color: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.1)', drawBorder: false },
      ticks: {
        font: { size: 11, family: "'Fira Code', monospace" },
        color: isDark ? '#94a3b8' : '#64748b',
        callback: (value) => value % 1 === 0 ? value : null,
      },
      title: { display: true, font: { size: 12, weight: '600', family: "'Fira Sans', sans-serif" }, color: isDark ? '#94a3b8' : '#64748b' },
    },
  },
  animation: { duration: 750, easing: 'easeOutQuart' },
});

const getDoughnutOptions = (isDark) => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  plugins: {
    legend: {
      position: 'right',
      labels: {
        usePointStyle: true,
        padding: 16,
        font: { size: 12, family: "'Fira Sans', sans-serif" },
        color: isDark ? '#e2e8f0' : '#1e293b',
        pointStyle: 'circle',
      },
    },
    tooltip: {
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      titleColor: isDark ? '#f1f5f9' : '#0f172a',
      bodyColor: isDark ? '#cbd5e1' : '#334155',
      borderColor: isDark ? '#334155' : '#e2e8f0',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12,
      callbacks: {
        label: (ctx) => `${ctx.label}: ${ctx.parsed}%`,
      },
    },
  },
  animation: { animateRotate: true, animateScale: true, duration: 1000, easing: 'easeOutQuart' },
});

export default function Dashboard() {
  const { addFlash } = useFlash();
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);
  const [kpis, setKpis] = useState([]);
  const [atRisk, setAtRisk] = useState(null);
  const [isDark, setIsDark] = useState(false);

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
      const colorIdx = idx % MULTI_COLORS.length;
      const colors = MULTI_COLORS[colorIdx];

      // Bar Chart - Compare Categories (sorted descending for readability)
      if (chart.type === 'bar') {
        const sorted = chart.labels
          .map((label, i) => ({ label, value: chart.data[i] }))
          .filter(d => d.value !== null && d.value !== undefined)
          .sort((a, b) => b.value - a.value);

        return {
          ...chart,
          chartType: 'bar',
          data: {
            labels: sorted.map(d => d.label),
            datasets: [{
              label: chart.yLabel || 'Value',
              data: sorted.map(d => d.value),
              backgroundColor: colors.bg,
              borderColor: colors.border,
              borderWidth: 2,
              borderRadius: 6,
              borderSkipped: false,
              maxBarThickness: 48,
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
              label: `${chart.yLabel} vs ${chart.xLabel}`,
              data: chart.data.map(d => ({ x: d.x, y: d.y })),
              backgroundColor: 'rgba(16, 185, 129, 0.6)',
              borderColor: 'rgb(16, 185, 129)',
              pointRadius: 6,
              pointHoverRadius: 8,
              pointBorderWidth: 2,
              pointBorderColor: '#fff',
            }],
          },
          options: {
            ...getChartOptions(isDark),
            scales: {
              ...getChartOptions(isDark).scales,
              x: { ...getChartOptions(isDark).scales.x, title: { ...getChartOptions(isDark).scales.x.title, text: chart.xLabel }, beginAtZero: true },
              y: { ...getChartOptions(isDark).scales.y, title: { ...getChartOptions(isDark).scales.y.title, text: chart.yLabel }, beginAtZero: true },
            },
          },
        };
      }

      // Line Chart - Trend Over Time
      if (chart.type === 'line') {
        return {
          ...chart,
          chartType: 'line',
          data: {
            labels: chart.labels,
            datasets: [{
              label: chart.yLabel || 'Value',
              data: chart.data,
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              borderColor: 'rgb(99, 102, 241)',
              borderWidth: 3,
              fill: true,
              tension: 0.3,
              pointRadius: 5,
              pointHoverRadius: 7,
              pointBackgroundColor: 'rgb(99, 102, 241)',
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
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
        const gradeColors = {
          A: { bg: 'rgba(16, 185, 129, 0.8)', border: 'rgb(16, 185, 129)' },
          B: { bg: 'rgba(6, 182, 212, 0.8)', border: 'rgb(6, 182, 212)' },
          C: { bg: 'rgba(245, 158, 11, 0.8)', border: 'rgb(245, 158, 11)' },
          D: { bg: 'rgba(249, 115, 22, 0.8)', border: 'rgb(249, 115, 22)' },
          F: { bg: 'rgba(239, 68, 68, 0.8)', border: 'rgb(239, 68, 68)' },
        };
        const backgrounds = chart.labels.map(l => gradeColors[l]?.bg || colors.bg);
        const borders = chart.labels.map(l => gradeColors[l]?.border || colors.border);

        return {
          ...chart,
          chartType: 'doughnut',
          data: {
            labels: chart.labels.map(l => `Grade ${l}`),
            datasets: [{ data: chart.data, backgroundColor: backgrounds, borderColor: borders, borderWidth: 3, hoverOffset: 8 }],
          },
          options: getDoughnutOptions(isDark),
        };
      }

      // Default fallback
      return {
        ...chart,
        chartType: 'bar',
        data: { labels: chart.labels, datasets: [{ label: chart.yLabel || 'Value', data: chart.data, backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: 4 }] },
        options: getChartOptions(isDark),
      };
    });
  }, [chartData, isDark]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="bento-grid-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[...Array(3)].map((_, i) => <SkeletonChart key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="bento-grid-4">
        {kpis.map((kpi, idx) => {
          const icons = [
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg>,
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
          ];
          const gradients = ['from-primary-500 to-accent-500', 'from-success-500 to-emerald-400', 'from-accent-500 to-warning-500', 'from-primary-600 to-violet-500'];
          return (
            <div key={idx} className="kpi-card group">
              <div className="flex items-start justify-between">
                <p className="kpi-label">{kpi.label}</p>
                <div className={`kpi-icon-box bg-gradient-to-br ${gradients[idx % 4]} text-white shadow-clay-sm`}>
                  {icons[idx % 4]}
                </div>
              </div>
              <p className="kpi-value">{formatKPI(kpi.value, kpi.format)}</p>
            </div>
          );
        })}
      </div>

      {/* At-Risk Students Warning */}
      {atRisk && atRisk.count > 0 && (
        <div className="card border-l-4 border-danger-500 bg-danger-50/60 dark:bg-danger-950/20 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="kpi-icon-box bg-danger-100 dark:bg-danger-900/40 text-danger-600 dark:text-danger-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-danger-700 dark:text-danger-400">
                  {atRisk.count} Student{atRisk.count !== 1 ? 's' : ''} at Risk
                </h3>
              </div>
              <p className="text-sm text-danger-600 dark:text-danger-400/80 mb-3 ml-12">
                Low attendance ({'<'}{atRisk.thresholds?.attendance || 75}%), study hours ({'<'}{atRisk.thresholds?.studyHours || 2}h), or GPA ({'<'}{atRisk.thresholds?.gpa || 2.5}).
              </p>
              <div className="flex flex-wrap gap-1.5 ml-12">
                {atRisk.students.slice(0, 8).map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white dark:bg-gray-800 text-primary-700 dark:text-gray-300 rounded-lg border border-primary-100 dark:border-gray-700">
                    #{s.id}
                  </span>
                ))}
                {atRisk.students.length > 8 && (
                  <span className="text-xs text-primary-400 dark:text-gray-500 px-2 py-1">
                    +{atRisk.students.length - 8} more
                  </span>
                )}
              </div>
            </div>
            <a href="#/students" className="btn-danger flex-shrink-0">View Students</a>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {charts.map((chart, idx) => (
          <div key={idx} className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-primary-950 dark:text-gray-100">{chart.title}</h3>
              {chart.xLabel && chart.yLabel && (
                <span className="text-xs text-primary-400 dark:text-gray-500 font-medium px-2 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30">
                  {chart.xLabel} → {chart.yLabel}
                </span>
              )}
            </div>
            <div className="chart-container" style={{ height: '340px' }}>
              {chart.chartType === 'bar' && (
                <Bar
                  data={chart.data}
                  options={chart.options}
                />
              )}
              {chart.chartType === 'scatter' && (
                <Scatter
                  data={chart.data}
                  options={chart.options}
                />
              )}
              {chart.chartType === 'line' && (
                <Line
                  data={chart.data}
                  options={chart.options}
                />
              )}
              {chart.chartType === 'doughnut' && (
                <Doughnut
                  data={chart.data}
                  options={chart.options}
                />
              )}
            </div>
          </div>
        ))}

        {!charts.length && (
          <div className="col-span-full text-center py-16 card">
            <svg className="w-16 h-16 mx-auto text-primary-200 dark:text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-primary-400 dark:text-gray-500 font-medium">No chart data available</p>
            <p className="text-sm text-primary-300 dark:text-gray-600 mt-1">Import a dataset with numeric columns to see visualizations.</p>
          </div>
        )}
      </div>
    </div>
  );
}