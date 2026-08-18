/**
 * Admin Dashboard - Analytics and insights using new UI components
 */

import { useEffect, useState, useMemo } from 'react';
import { api, ApiError } from '../api';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { Doughnut, Bar } from 'react-chartjs-2';
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
import { GRADE_COLORS, getChartOptions, getDoughnutOptions } from '../utils/chartTheme';
import {
  Card,
  KPICard,
  Button,
  Badge,
  Icon,
  getIcon,
  Flex,
  Grid2,
  SkeletonCard,
  SkeletonChart,
} from '../components/ui';
import { useFlash } from '../components/ui/Toast';

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

export default function AdminDashboard() {
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const { addFlash } = useFlash();
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
        <div className="bento-grid-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} padding="lg" />)}
        </div>
        <div className="bento-grid-2">
          {[...Array(6)].map((_, i) => <SkeletonChart key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card padding="lg" className="text-center py-12">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-danger-100 dark:bg-danger-900/40 text-danger-600 dark:text-danger-400 flex items-center justify-center">
          <Icon name="alertTriangle" className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-2">{t('admin.failedToLoad')}</h3>
        <p className="text-primary-500 dark:text-gray-400 mb-4">{error}</p>
        <Button variant="primary" leftIcon={<Icon name="refreshCw" className="w-4 h-4" />} onClick={() => { setRefreshing(true); fetchAnalytics(); }} disabled={refreshing} loading={refreshing}>
          {t('common.tryAgain')}
        </Button>
      </Card>
    );
  }

  if (!analytics) return null;

  // Null-safe: `?? {}` catches both undefined AND null
  const kpis = analytics.kpis ?? {};
  const charts = analytics.charts ?? {};

  // ── Grade Distribution (Doughnut) ───────────────────────────────────────────
  const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
  const sortedGradeDist = gradeOrder
    .map((g) => (charts.gradeDistribution || []).find((d) => d.grade === g))
    .filter(Boolean);

  const gradeDistributionData = useMemo(() => ({
    labels: sortedGradeDist.map((d) => d.grade),
    datasets: [{
      data: sortedGradeDist.map((d) => d.count),
      backgroundColor: sortedGradeDist.map((d) => GRADE_COLORS[d.grade]?.bg ?? 'rgba(148,163,184,0.8)'),
      borderColor: sortedGradeDist.map((d) => GRADE_COLORS[d.grade]?.border ?? 'rgb(148,163,184)'),
      borderWidth: 1,
      hoverOffset: 8,
    }],
  }), [sortedGradeDist]);

  const gradeDistributionOptions = useMemo(() => getDoughnutOptions(isDark, (ctx) => {
    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
    const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
    return `Grade ${ctx.label}: ${ctx.raw} (${pct}%)`;
  }), [isDark]);

  // ── Attendance Distribution (Doughnut) ────────────────────────────────────────
  const attendanceVsScore = charts.attendanceVsScore || [];
  const attendanceBuckets = [
    { label: t('admin.attendanceRange0'), min: 0, max: 59 },
    { label: t('admin.attendanceRange1'), min: 60, max: 69 },
    { label: t('admin.attendanceRange2'), min: 70, max: 79 },
    { label: t('admin.attendanceRange3'), min: 80, max: 89 },
    { label: t('admin.attendanceRange4'), min: 90, max: 100 },
  ];
  const attendanceCounts = attendanceBuckets.map((bucket) =>
    attendanceVsScore.filter((p) => p.x >= bucket.min && p.x <= bucket.max).length
  );
  const attendanceDistributionData = useMemo(() => ({
    labels: attendanceBuckets.map((b) => b.label),
    datasets: [{
      data: attendanceCounts,
      backgroundColor: [
        'rgba(239, 68, 68, 0.8)',
        'rgba(249, 115, 22, 0.8)',
        'rgba(234, 179, 8, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(16, 185, 129, 0.8)',
      ],
      borderColor: [
        'rgb(239, 68, 68)',
        'rgb(249, 115, 22)',
        'rgb(234, 179, 8)',
        'rgb(34, 197, 94)',
        'rgb(16, 185, 129)',
      ],
      borderWidth: 1,
      hoverOffset: 8,
    }],
  }), [attendanceCounts]);

  const attendanceDistributionOptions = useMemo(() => getDoughnutOptions(isDark, (ctx) => {
    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
    const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
    return `${ctx.label}: ${ctx.raw} (${pct}%)`;
  }), [isDark]);

  // ── Part-Time Job Impact (Bar, vertical) ───────────────────────────────────
  const partTimeJob = charts.partTimeJobImpact || [];
  const partTimeJobData = useMemo(() => ({
    labels: partTimeJob.map((d) => d.category),
    datasets: [{
      label: `Average ${t('admin.finalScore')}`,
      data: partTimeJob.map((d) => Number(d.avgScore?.toFixed(1) || 0)),
      backgroundColor: partTimeJob.map((_, i) => (i === 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)')),
      borderRadius: 8,
      borderSkipped: false,
    }],
  }), [partTimeJob, t]);

  // ── Sleep Impact (Bar, vertical) ────────────────────────────────────────────
  const sleepImpact = charts.sleepImpact || [];
  const sleepImpactData = useMemo(() => ({
    labels: sleepImpact.map((d) => d.sleepBucket),
    datasets: [{
      label: `Average ${t('admin.finalScore')}`,
      data: sleepImpact.map((d) => Number(d.avgScore?.toFixed(1) || 0)),
      backgroundColor: 'rgba(139, 92, 246, 0.8)',
      borderRadius: 8,
      borderSkipped: false,
    }],
  }), [sleepImpact, t]);

  // ── Gender Distribution (Bar, vertical) ─────────────────────────────────────
  const genderDist = charts.genderDistribution || [];
  const genderData = useMemo(() => ({
    labels: genderDist.map((d) => d.gender),
    datasets: [{
      label: 'Count',
      data: genderDist.map((d) => d.count),
      backgroundColor: genderDist.map((_, i) => (i % 2 === 0 ? 'rgba(236, 72, 153, 0.8)' : 'rgba(59, 130, 246, 0.8)')),
      borderRadius: 8,
      borderSkipped: false,
    }],
  }), [genderDist]);

  // ── Parental Education Distribution (Bar, vertical) ──────────────────────────
  const parentalEduDist = charts.parentalEduDistribution || [];
  const parentalEduData = useMemo(() => ({
    labels: parentalEduDist.map((d) => d.education),
    datasets: [{
      label: 'Count',
      data: parentalEduDist.map((d) => d.count),
      backgroundColor: 'rgba(245, 158, 11, 0.8)',
      borderRadius: 8,
      borderSkipped: false,
    }],
  }), [parentalEduDist]);

  // Shared chart options
  const baseBar = useMemo(() => getChartOptions(isDark), [isDark]);
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

  // KPI Cards configuration
  const kpiCards = [
    { key: 'totalStudents', label: t('admin.totalStudents'), value: kpis.totalStudents?.toLocaleString() || '0', icon: 'users', variant: 'primary' },
    { key: 'avgGpa', label: t('admin.averageGPA'), value: kpis.avgGpa?.toFixed(2) || '0.00', icon: 'award', variant: 'success' },
    { key: 'passRate', label: t('admin.passRate'), value: `${(kpis.passRate || 0).toFixed(1)}%`, icon: 'trendingUp', variant: 'accent' },
    { key: 'atRiskCount', label: t('admin.atRiskCount'), value: kpis.atRiskCount?.toLocaleString() || '0', icon: 'alertTriangle', variant: 'warning' },
  ];

  // Key Insights computation
  const insights = useMemo(() => {
    const list = [];

    // 1. Pass rate health check
    const passRate = Number(kpis.passRate || 0);
    if (passRate > 0) {
      if (passRate < 70) {
        list.push({
          key: 'passRateLow',
          icon: 'alertTriangle',
          variant: 'danger',
          message: t('admin.insightPassRateLow', { rate: passRate.toFixed(1) }),
        });
      } else {
        list.push({
          key: 'passRateHealthy',
          icon: 'trendingUp',
          variant: 'success',
          message: t('admin.insightPassRateHealthy', { rate: passRate.toFixed(1) }),
        });
      }
    }

    // 2. At-risk cohort signal
    const atRiskCount = Number(kpis.atRiskCount || 0);
    if (atRiskCount > 0) {
      list.push({
        key: 'atRisk',
        icon: 'alertCircle',
        variant: 'warning',
        message: t('admin.insightAtRisk', { count: atRiskCount.toLocaleString() }),
      });
    }

    // 3. Grade distribution skew — F is largest segment
    const gradeDist = charts.gradeDistribution || [];
    const totalStudents = gradeDist.reduce((sum, d) => sum + (d.count || 0), 0);
    const fGrade = gradeDist.find(d => d.grade === 'F');
    if (fGrade && totalStudents > 0) {
      const otherGrades = gradeDist.filter(d => d.grade !== 'F');
      const maxOtherCount = otherGrades.reduce((max, d) => Math.max(max, d.count || 0), 0);
      if (fGrade.count > maxOtherCount && fGrade.count > totalStudents * 0.25) {
        list.push({
          key: 'gradeSkew',
          icon: 'alertTriangle',
          variant: 'danger',
          message: t('admin.insightGradeSkew'),
        });
      }
    }

    // 4. Part-time job impact gap
    if (partTimeJob.length === 2) {
      const noJob = partTimeJob.find(d => d.category === 'No' || d.category === 'No ' || d.category.toLowerCase().includes('no'));
      const hasJob = partTimeJob.find(d => d.category === 'Yes' || d.category === 'Yes ' || d.category.toLowerCase().includes('yes'));
      if (noJob && hasJob && typeof noJob.avgScore === 'number' && typeof hasJob.avgScore === 'number') {
        const gap = (noJob.avgScore - hasJob.avgScore).toFixed(1);
        if (gap > 3) {
          list.push({
            key: 'partTimeJob',
            icon: 'award',
            variant: 'primary',
            message: t('admin.insightPartTimeJob', { gap }),
          });
        }
      }
    }

    return list.slice(0, 3);
  }, [kpis, charts, partTimeJob, t]);

  const EmptyChart = ({ message }) => (
    <Card padding="lg" className="text-center py-12">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary-100 dark:bg-gray-800 flex items-center justify-center">
        <Icon name="alertCircle" className="w-6 h-6 text-primary-400 dark:text-gray-500" />
      </div>
      <p className="text-sm text-primary-500 dark:text-gray-400">{message}</p>
    </Card>
  );

  const InsightCard = ({ icon, variant, message }) => (
    <Card variant="default" className="bg-primary-50 dark:bg-primary-900/20" padding="md">
      <Flex gap={4} align="start">
        <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon name={icon} className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <p className="text-sm text-primary-950 dark:text-gray-100 leading-relaxed">{message}</p>
      </Flex>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Flex direction="col" gap={4} className="sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">{t('nav.adminDashboard')}</h1>
          <p className="text-primary-500 dark:text-gray-400 mt-1">{t('admin.analyticsDesc')}</p>
        </div>
        <Button
          variant="secondary"
          leftIcon={<Icon name="refreshCw" className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
          onClick={() => { setRefreshing(true); fetchAnalytics(); }}
          disabled={refreshing}
          loading={refreshing}
        >
          {t('admin.refresh')}
        </Button>
      </Flex>

      {/* KPI Cards */}
      <div className="bento-grid-4">
        {kpiCards.map((kpi) => (
          <KPICard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            icon={<Icon name={kpi.icon} className="w-6 h-6" />}
            variant={kpi.variant}
            featured={false}
          />
        ))}
      </div>

      {/* Key Insights */}
      <Card padding="lg">
        <Flex align="center" gap={2} className="mb-4">
          <Icon name="lightbulb" className="w-5 h-5 text-primary-500" />
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100">{t('admin.insightsTitle')}</h3>
        </Flex>
        <div className="space-y-3">
          {insights.length > 0 ? (
            insights.map((insight) => (
              <InsightCard key={insight.key} icon={insight.icon} variant={insight.variant} message={insight.message} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                <Icon name="lightbulb" className="w-6 h-6 text-primary-400 dark:text-gray-500" />
              </div>
              <p className="text-sm text-primary-500 dark:text-gray-400">{t('admin.insightNoData')}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Charts Grid */}
      <div className="bento-grid-2">
        <Card padding="lg">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.gradeDistribution')}</h3>
          <div className="chart-container" style={{ height: '300px', position: 'relative' }}>
            {sortedGradeDist.length > 0
              ? <Doughnut data={gradeDistributionData} options={gradeDistributionOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>

        <Card padding="lg">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.attendanceDistribution')}</h3>
          <div className="chart-container" style={{ height: '300px', position: 'relative' }}>
            {attendanceVsScore.length > 0
              ? <Doughnut data={attendanceDistributionData} options={attendanceDistributionOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>

        <Card padding="lg">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.partTimeJobImpact')}</h3>
          <div className="chart-container" style={{ height: '300px', position: 'relative' }}>
            {partTimeJob.length > 0
              ? <Bar data={partTimeJobData} options={partTimeJobOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>

        <Card padding="lg">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.sleepImpact')}</h3>
          <div className="chart-container" style={{ height: '300px', position: 'relative' }}>
            {sleepImpact.length > 0
              ? <Bar data={sleepImpactData} options={sleepImpactOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>

        <Card padding="lg" className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.genderDistribution')}</h3>
          <div className="chart-container" style={{ height: '300px', position: 'relative' }}>
            {genderDist.length > 0
              ? <Bar data={genderData} options={genderOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>

        <Card padding="lg" className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.parentalEduDistribution')}</h3>
          <div className="chart-container" style={{ height: '300px', position: 'relative' }}>
            {parentalEduDist.length > 0
              ? <Bar data={parentalEduData} options={parentalEduOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>
      </div>
    </div>
  );
}