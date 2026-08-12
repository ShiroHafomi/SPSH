import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { Doughnut, Scatter, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import {
  Users,
  GraduationCap,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  GRADE_COLORS,
  getChartOptions,
  getDoughnutOptions,
  getScatterOptions,
} from '../utils/chartTheme';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Per-card semantic border accents — utility classes, design-token backed, dark-mode aware.
const KPI_CARD_COLORS = {
  green: 'border-emerald-200 dark:border-emerald-800/30',
  blue: 'border-primary-200 dark:border-primary-800/30',
  purple: 'border-violet-200 dark:border-violet-800/30',
  orange: 'border-amber-200 dark:border-amber-800/30',
};

function KPICard({ title, value, icon: Icon, colorClass }) {
  return (
    <div className={`card-clay p-6 hover:shadow-clay-md ${colorClass}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-primary-500 dark:text-primary-400 mb-1">{title}</p>
          <p className="text-3xl font-bold text-primary-950 dark:text-gray-100 tabular-nums font-mono">{value}</p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
      </div>
    </div>
  );
}

function ChartWrapper({ title, children, className = '' }) {
  return (
    <div className={`card-clay p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{title}</h3>
      <div className="chart-container">{children}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get('/admin/analytics');
      setAnalytics(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('admin.failedToLoad'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card-clay p-6">
              <div className="skeleton h-4 w-3/4 mb-4" />
              <div className="skeleton h-8 w-1/2" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card-clay p-6">
              <div className="skeleton h-6 w-1/3 mb-6" />
              <div className="skeleton" style={{ height: '260px' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-danger-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-2">{t('admin.failedToLoad')}</h3>
        <p className="text-primary-500 dark:text-gray-400 mb-4">{error}</p>
        <button onClick={fetchAnalytics} className="btn-primary">
          <RefreshCw className="w-4 h-4 mr-2" /> {t('common.tryAgain')}
        </button>
      </div>
    );
  }

  if (!analytics) return null;

  const { kpis = {}, charts = {} } = analytics;

  // ── Grade Distribution (Doughnut) ───────────────────────────────────────────
  const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
  const sortedGradeDist = gradeOrder
    .map((g) => (charts.gradeDistribution || []).find((d) => d.grade === g))
    .filter(Boolean);

  const gradeDistributionData = {
    labels: sortedGradeDist.map((d) => d.grade),
    datasets: [{
      data: sortedGradeDist.map((d) => d.count),
      backgroundColor: sortedGradeDist.map((d) => GRADE_COLORS[d.grade]?.bg ?? 'rgba(148,163,184,0.8)'),
      borderColor: sortedGradeDist.map((d) => GRADE_COLORS[d.grade]?.border ?? 'rgb(148,163,184)'),
      borderWidth: 1,
      hoverOffset: 8,
    }],
  };
  const gradeDistributionOptions = getDoughnutOptions(isDark, (ctx) => {
    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
    const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
    return `Grade ${ctx.label}: ${ctx.raw} (${pct}%)`;
  });

  // ── Attendance vs Final Score (Scatter) ─────────────────────────────────────
  const attendanceVsScore = charts.attendanceVsScore || [];
  const attendanceVsScoreData = {
    datasets: [{
      label: 'Students',
      data: attendanceVsScore.map((p) => ({ x: p.x, y: p.y })),
      backgroundColor: 'rgba(99, 102, 241, 0.6)',
      borderColor: 'rgb(99, 102, 241)',
      borderWidth: 1,
      pointRadius: 6,
      pointHoverRadius: 8,
    }],
  };
  const scatterBase = getScatterOptions(isDark, `${t('admin.attendance')} (%)`, t('admin.finalScore'));
  const attendanceVsScoreOptions = {
    ...scatterBase,
    scales: {
      x: { ...scatterBase.scales.x, min: 0, max: 100 },
      y: { ...scatterBase.scales.y, min: 0, max: 100 },
    },
    plugins: {
      ...scatterBase.plugins,
      tooltip: {
        ...scatterBase.plugins.tooltip,
        callbacks: {
          label: (ctx) => `${t('admin.attendance')}: ${ctx.raw.x}%, ${t('admin.finalScore')}: ${ctx.raw.y}`,
        },
      },
    },
  };

  // ── Part-Time Job Impact (Bar, vertical) ───────────────────────────────────
  const partTimeJob = charts.partTimeJobImpact || [];
  const partTimeJobData = {
    labels: partTimeJob.map((d) => d.category),
    datasets: [{
      label: `Average ${t('admin.finalScore')}`,
      data: partTimeJob.map((d) => Number(d.avgScore?.toFixed(1) || 0)),
      backgroundColor: partTimeJob.map((_, i) => (i === 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)')),
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  // ── Sleep Impact (Bar, vertical) ────────────────────────────────────────────
  const sleepImpact = charts.sleepImpact || [];
  const sleepImpactData = {
    labels: sleepImpact.map((d) => d.sleepBucket),
    datasets: [{
      label: `Average ${t('admin.finalScore')}`,
      data: sleepImpact.map((d) => Number(d.avgScore?.toFixed(1) || 0)),
      backgroundColor: 'rgba(139, 92, 246, 0.8)',
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  // ── Gender Distribution (Bar, vertical) ─────────────────────────────────────
  const genderDist = charts.genderDistribution || [];
  const genderData = {
    labels: genderDist.map((d) => d.gender),
    datasets: [{
      label: 'Count',
      data: genderDist.map((d) => d.count),
      backgroundColor: genderDist.map((_, i) => (i % 2 === 0 ? 'rgba(236, 72, 153, 0.8)' : 'rgba(59, 130, 246, 0.8)')),
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  // ── Parental Education Distribution (Bar, vertical) ──────────────────────────
  const parentalEduDist = charts.parentalEduDistribution || [];
  const parentalEduData = {
    labels: parentalEduDist.map((d) => d.education),
    datasets: [{
      label: 'Count',
      data: parentalEduDist.map((d) => d.count),
      backgroundColor: 'rgba(245, 158, 11, 0.8)',
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  // Shared vertical-bar options (legend hidden). part-time & sleep cap y at 100 (avg scores);
  // gender & parental are raw counts → no cap.
  const baseBar = getChartOptions(isDark);
  const noLegendPlugins = { ...baseBar.plugins, legend: { ...baseBar.plugins.legend, display: false } };
  const partTimeJobOptions = {
    ...baseBar,
    plugins: noLegendPlugins,
    scales: { ...baseBar.scales, y: { ...baseBar.scales.y, max: 100 } },
  };
  const sleepImpactOptions = {
    ...baseBar,
    plugins: noLegendPlugins,
    scales: { ...baseBar.scales, y: { ...baseBar.scales.y, max: 100 } },
  };
  const genderOptions = { ...baseBar, plugins: noLegendPlugins };
  const parentalEduOptions = { ...baseBar, plugins: noLegendPlugins };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">{t('nav.adminDashboard')}</h1>
          <p className="text-primary-500 dark:text-gray-400 mt-1">{t('admin.analyticsDesc')}</p>
        </div>
        <button
          onClick={() => { setRefreshing(true); fetchAnalytics(); }}
          disabled={refreshing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {t('admin.refresh')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard title={t('admin.totalStudents')} value={kpis.totalStudents?.toLocaleString() || '0'} icon={Users} colorClass={KPI_CARD_COLORS.blue} />
        <KPICard title={t('admin.averageGPA')} value={kpis.avgGpa?.toFixed(2) || '0.00'} icon={GraduationCap} colorClass={KPI_CARD_COLORS.green} />
        <KPICard title={t('admin.passRate')} value={`${(kpis.passRate || 0).toFixed(1)}%`} icon={TrendingUp} colorClass={KPI_CARD_COLORS.purple} />
        <KPICard title={t('admin.atRiskCount')} value={kpis.atRiskCount?.toLocaleString() || '0'} icon={AlertTriangle} colorClass={KPI_CARD_COLORS.orange} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper title={t('admin.gradeDistribution')}>
          <Doughnut data={gradeDistributionData} options={gradeDistributionOptions} />
        </ChartWrapper>
        <ChartWrapper title={t('admin.attendanceVsScore')}>
          <Scatter data={attendanceVsScoreData} options={attendanceVsScoreOptions} />
        </ChartWrapper>
        <ChartWrapper title={t('admin.partTimeJobImpact')}>
          <Bar data={partTimeJobData} options={partTimeJobOptions} />
        </ChartWrapper>
        <ChartWrapper title={t('admin.sleepImpact')}>
          <Bar data={sleepImpactData} options={sleepImpactOptions} />
        </ChartWrapper>
        <ChartWrapper title={t('admin.genderDistribution')} className="lg:col-span-2">
          <Bar data={genderData} options={genderOptions} />
        </ChartWrapper>
        <ChartWrapper title={t('admin.parentalEduDistribution')} className="lg:col-span-2">
          <Bar data={parentalEduData} options={parentalEduOptions} />
        </ChartWrapper>
      </div>
    </div>
  );
}
