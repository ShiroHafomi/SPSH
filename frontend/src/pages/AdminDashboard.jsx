import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { useLanguage } from '../hooks/useLanguage';
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

const KPI_CARD_STYLES = {
  base: 'rounded-2xl p-6 border bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl transition-all duration-300 hover:shadow-clay-md',
  green: 'border-emerald-200 dark:border-emerald-800/30',
  blue: 'border-primary-200 dark:border-primary-800/30',
  purple: 'border-violet-200 dark:border-violet-800/30',
  orange: 'border-amber-200 dark:border-amber-800/30',
};

function KPICard({ title, value, icon: Icon, colorClass }) {
  return (
    <div className={`${KPI_CARD_STYLES.base} ${colorClass}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-primary-500 dark:text-primary-400 mb-1">{title}</p>
          <p className="text-3xl font-bold text-primary-950 dark:text-gray-100">{value}</p>
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
    <div className={`rounded-2xl p-6 border bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-clay-sm ${className}`}>
      <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{title}</h3>
      <div style={{ height: '300px' }}>{children}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const { t } = useLanguage();
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
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl p-6 border bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4" />
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl p-6 border bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl animate-pulse h-80">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
              <div className="h-full bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-error-500 mx-auto mb-4" />
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

  // Grade Distribution Donut Chart - backend returns [{grade: 'A', count: 5}, ...]
  const gradeDist = charts.gradeDistribution || [];
  const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
  const sortedGradeDist = gradeOrder
    .map(g => gradeDist.find(d => d.grade === g))
    .filter(Boolean);
  const gradeDistributionData = {
    labels: sortedGradeDist.map(d => d.grade),
    datasets: [{
      data: sortedGradeDist.map(d => d.count),
      backgroundColor: [
        'rgba(34, 197, 94, 0.8)',   // A - emerald
        'rgba(16, 185, 129, 0.8)',  // B - emerald-500
        'rgba(59, 130, 246, 0.8)',  // C - primary
        'rgba(245, 158, 11, 0.8)',  // D - amber
        'rgba(239, 68, 68, 0.8)',   // F - error
      ],
      borderWidth: 0,
      hoverOffset: 8,
    }],
  };

  const gradeDistributionOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          padding: 12,
          font: { size: 12 },
          color: '#475569',
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
            return `${context.label}: ${context.raw} (${percentage}%)`;
          },
        },
      },
    },
    cutout: '60%',
  };

  // Attendance vs Score Scatter Chart - backend returns ['x': 85, 'y': 90}, ...]
  const attendanceVsScore = charts.attendanceVsScore || [];
  const attendanceVsScoreData = {
    datasets: [{
      label: 'Students',
      data: attendanceVsScore.map(p => ({ x: p.x, y: p.y })),
      backgroundColor: 'rgba(59, 130, 246, 0.6)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 1,
      pointRadius: 6,
      pointHoverRadius: 8,
    }],
  };

  const attendanceVsScoreOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${t('admin.attendance')}: ${context.raw.x}%, ${t('admin.finalScore')}: ${context.raw.y}`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: t('admin.attendance') + ' (%)', color: '#475569' },
        min: 0,
        max: 100,
        grid: { color: 'rgba(71, 85, 105, 0.1)' },
        ticks: { color: '#475569' },
      },
      y: {
        title: { display: true, text: t('admin.finalScore'), color: '#475569' },
        min: 0,
        max: 100,
        grid: { color: 'rgba(71, 85, 105, 0.1)' },
        ticks: { color: '#475569' },
      },
    },
  };

  // Part-Time Job Impact Bar Chart - backend returns ['category': 'Yes', avgScore: 75, count: 10}, ...]
  const partTimeJob = charts.partTimeJobImpact || [];
  const partTimeJobData = {
    labels: partTimeJob.map(d => d.category),
    datasets: [{
      label: `Average ${t('admin.finalScore')}`,
      data: partTimeJob.map(d => Number(d.avgScore?.toFixed(1) || 0)),
      backgroundColor: partTimeJob.map((_, i) => i === 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)'),
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  const partTimeJobOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, max: 100, grid: { color: 'rgba(71, 85, 105, 0.1)' }, ticks: { color: '#475569' } },
      x: { grid: { display: false }, ticks: { color: '#475569' } },
    },
  };

  // Sleep Impact Bar Chart - backend returns ['sleepBucket': '7h', avgScore: 82, count: 5}, ...]
  const sleepImpact = charts.sleepImpact || [];
  const sleepImpactData = {
    labels: sleepImpact.map(d => d.sleepBucket),
    datasets: [{
      label: `Average ${t('admin.finalScore')}`,
      data: sleepImpact.map(d => Number(d.avgScore?.toFixed(1) || 0)),
      backgroundColor: 'rgba(139, 92, 246, 0.8)',
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  const sleepImpactOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, max: 100, grid: { color: 'rgba(71, 85, 105, 0.1)' }, ticks: { color: '#475569' } },
      x: { grid: { display: false }, ticks: { color: '#475569' } },
    },
  };

  // Gender Distribution Bar Chart - backend returns ['gender': 'Female', count: 15}, ...]
  const genderDist = charts.genderDistribution || [];
  const genderData = {
    labels: genderDist.map(d => d.gender),
    datasets: [{
      label: 'Count',
      data: genderDist.map(d => d.count),
      backgroundColor: genderDist.map((_, i) => i % 2 === 0 ? 'rgba(236, 72, 153, 0.8)' : 'rgba(59, 130, 246, 0.8)'),
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  const genderOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(71, 85, 105, 0.1)' }, ticks: { color: '#475569' } },
      x: { grid: { display: false }, ticks: { color: '#475569' } },
    },
  };

  // Parental Education Distribution Bar Chart
  const parentalEduDist = charts.parentalEduDistribution || [];
  const parentalEduData = {
    labels: parentalEduDist.map(d => d.education),
    datasets: [{
      label: 'Count',
      data: parentalEduDist.map(d => d.count),
      backgroundColor: 'rgba(245, 158, 11, 0.8)',
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  const parentalEduOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(71, 85, 105, 0.1)' }, ticks: { color: '#475569' } },
      x: { grid: { display: false }, ticks: { color: '#475569' } },
    },
  };

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
        <KPICard
          title={t('admin.totalStudents')}
          value={kpis.totalStudents?.toLocaleString() || '0'}
          icon={Users}
          colorClass={KPI_CARD_STYLES.blue}
        />
        <KPICard
          title={t('admin.averageGPA')}
          value={kpis.avgGpa?.toFixed(2) || '0.00'}
          icon={GraduationCap}
          colorClass={KPI_CARD_STYLES.green}
        />
        <KPICard
          title={t('admin.passRate')}
          value={`${(kpis.passRate || 0).toFixed(1)}%`}
          icon={TrendingUp}
          colorClass={KPI_CARD_STYLES.purple}
        />
        <KPICard
          title={t('admin.atRiskCount')}
          value={kpis.atRiskCount?.toLocaleString() || '0'}
          icon={AlertTriangle}
          colorClass={KPI_CARD_STYLES.orange}
        />
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