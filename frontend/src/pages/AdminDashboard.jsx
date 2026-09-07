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
import { CHART_THEME, GRADE_COLORS, formatChartValue, getChartOptions, getDoughnutOptions, getMultiSeriesColors } from '../utils/chartTheme';
import { formatAdminMetric } from '../utils/adminAiTools.js';
import {
  Card,
  KPICard,
  Button,
  Icon,
  Flex,
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
  const { lang, t } = useLanguage();
  const { isDark } = useTheme();
  const chartTheme = isDark ? CHART_THEME.dark : CHART_THEME.light;
  const seriesColors = useMemo(() => getMultiSeriesColors(isDark), [isDark]);
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

  // Keep every hook above conditional returns so loading the async response never
  // changes hook order between renders.
  const kpis = analytics?.kpis ?? {};
  const charts = analytics?.charts ?? {};

  // ── Grade Distribution (Doughnut) ───────────────────────────────────────────
  const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
  const sortedGradeDist = gradeOrder
    .map((g) => (charts.gradeDistribution || []).find((d) => d.grade === g))
    .filter(Boolean);

  const gradeDistributionData = useMemo(() => ({
    labels: sortedGradeDist.map((d) => d.grade),
    datasets: [{
      data: sortedGradeDist.map((d) => d.count),
      backgroundColor: sortedGradeDist.map((d) => GRADE_COLORS[d.grade]?.bg ?? chartTheme.primary.bg),
      borderColor: chartTheme.background,
      borderWidth: 2,
      hoverOffset: 6,
    }],
  }), [sortedGradeDist]);

  const gradeDistributionOptions = useMemo(() => getDoughnutOptions(isDark, (ctx) => {
    const total = ctx.dataset.data.reduce((sum, value) => sum + value, 0);
    const percentage = total > 0 ? (ctx.raw / total) * 100 : 0;
    return `${t('common.grade')} ${ctx.label}: ${formatChartValue(ctx.raw, lang)} (${formatChartValue(percentage, lang)}%)`;
  }), [isDark, lang, t]);

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
        GRADE_COLORS.F.bg,
        GRADE_COLORS.D.bg,
        GRADE_COLORS.C.bg,
        GRADE_COLORS.B.bg,
        GRADE_COLORS.A.bg,
      ],
      borderColor: chartTheme.background,
      borderWidth: 2,
      hoverOffset: 6,
    }],
  }), [attendanceCounts]);

  const attendanceDistributionOptions = useMemo(() => getDoughnutOptions(isDark, (ctx) => {
    const total = ctx.dataset.data.reduce((sum, value) => sum + value, 0);
    const percentage = total > 0 ? (ctx.raw / total) * 100 : 0;
    return `${ctx.label}: ${formatChartValue(ctx.raw, lang)} (${formatChartValue(percentage, lang)}%)`;
  }), [isDark, lang]);

  // ── Part-Time Job Impact (Bar, vertical) ───────────────────────────────────
  const partTimeJob = charts.partTimeJobImpact || [];
  const partTimeJobData = useMemo(() => ({
    labels: partTimeJob.map((d) => d.category),
    datasets: [{
      label: t('common.averageScore'),
      data: partTimeJob.map((d) => {
        const score = Number(d.avgScore);
        return Number.isFinite(score) ? Number(score.toFixed(1)) : null;
      }),
      backgroundColor: partTimeJob.map((d) => {
        const hasPartTimeJob = ['yes', 'true', '1'].includes(String(d.category).trim().toLowerCase());
        return hasPartTimeJob ? chartTheme.danger.bg : chartTheme.success.bg;
      }),
      borderColor: partTimeJob.map((d) => {
        const hasPartTimeJob = ['yes', 'true', '1'].includes(String(d.category).trim().toLowerCase());
        return hasPartTimeJob ? chartTheme.danger.border : chartTheme.success.border;
      }),
      borderWidth: 1,
    }],
  }), [chartTheme, partTimeJob, t]);

  // ── Sleep Impact (Bar, vertical) ────────────────────────────────────────────
  const sleepImpact = charts.sleepImpact || [];
  const sleepImpactData = useMemo(() => ({
    labels: sleepImpact.map((d) => d.sleepBucket),
    datasets: [{
      label: t('common.averageScore'),
      data: sleepImpact.map((d) => {
        const score = Number(d.avgScore);
        return Number.isFinite(score) ? Number(score.toFixed(1)) : null;
      }),
      backgroundColor: seriesColors[0].bg,
      borderColor: seriesColors[0].border,
      borderWidth: 1,
    }],
  }), [seriesColors, sleepImpact, t]);

  // ── Gender Distribution (Bar, vertical) ─────────────────────────────────────
  const genderDist = charts.genderDistribution || [];
  const genderData = useMemo(() => ({
    labels: genderDist.map((d) => d.gender),
    datasets: [{
      label: t('common.count'),
      data: genderDist.map((d) => d.count),
      backgroundColor: genderDist.map((d) => {
        const value = String(d.gender).trim().toLowerCase();
        if (value === 'female') return seriesColors[4].bg;
        if (value === 'male') return seriesColors[0].bg;
        return seriesColors[2].bg;
      }),
      borderColor: genderDist.map((d) => {
        const value = String(d.gender).trim().toLowerCase();
        if (value === 'female') return seriesColors[4].border;
        if (value === 'male') return seriesColors[0].border;
        return seriesColors[2].border;
      }),
      borderWidth: 1,
    }],
  }), [genderDist, seriesColors, t]);

  // ── Parental Education Distribution (Bar, vertical) ──────────────────────────
  const parentalEduDist = charts.parentalEduDistribution || [];
  const parentalEduData = useMemo(() => ({
    labels: parentalEduDist.map((d) => d.education),
    datasets: [{
      label: t('common.count'),
      data: parentalEduDist.map((d) => d.count),
      backgroundColor: seriesColors[2].bg,
      borderColor: seriesColors[2].border,
      borderWidth: 1,
    }],
  }), [parentalEduDist, seriesColors, t]);

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
    { key: 'totalStudents', label: t('admin.totalStudents'), value: formatAdminMetric(kpis.totalStudents, 0), icon: 'users', variant: 'primary' },
    { key: 'avgGpa', label: t('admin.averageGPA'), value: formatAdminMetric(kpis.avgGpa, 2), icon: 'award', variant: 'success' },
    { key: 'passRate', label: t('admin.passRate'), value: formatAdminMetric(kpis.passRate, 1, '%'), icon: 'trendingUp', variant: 'accent' },
    { key: 'atRiskCount', label: t('admin.atRiskCount'), value: formatAdminMetric(kpis.atRiskCount, 0), icon: 'alertTriangle', variant: 'warning' },
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
      const noJob = partTimeJob.find(d => String(d.category).trim().toLowerCase() === 'no');
      const hasJob = partTimeJob.find(d => String(d.category).trim().toLowerCase() === 'yes');
      const noJobScore = Number(noJob?.avgScore);
      const hasJobScore = Number(hasJob?.avgScore);
      if (Number.isFinite(noJobScore) && Number.isFinite(hasJobScore)) {
        const gap = (noJobScore - hasJobScore).toFixed(1);
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

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label={t('dashboard.loading')}>
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
      <div className="bento-grid-4" role="region" aria-label={t('dashboard.keyMetrics')}>
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
      <div className="bento-grid-2" role="region" aria-label={t('dashboard.analyticsCharts')}>
        <Card padding="lg">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.gradeDistribution')}</h3>
          <div
            className="chart-container"
            style={{ height: '300px', position: 'relative' }}
            role="img"
            aria-label={t('dashboard.chartAria', { title: t('admin.gradeDistribution'), count: sortedGradeDist.length })}
          >
            {sortedGradeDist.length > 0
              ? <Doughnut data={gradeDistributionData} options={gradeDistributionOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>

        <Card padding="lg">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.attendanceDistribution')}</h3>
          <div
            className="chart-container"
            style={{ height: '300px', position: 'relative' }}
            role="img"
            aria-label={t('dashboard.chartAria', { title: t('admin.attendanceDistribution'), count: attendanceBuckets.length })}
          >
            {attendanceVsScore.length > 0
              ? <Doughnut data={attendanceDistributionData} options={attendanceDistributionOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>

        <Card padding="lg">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.partTimeJobImpact')}</h3>
          <div
            className="chart-container"
            style={{ height: '300px', position: 'relative' }}
            role="img"
            aria-label={t('dashboard.chartAria', { title: t('admin.partTimeJobImpact'), count: partTimeJob.length })}
          >
            {partTimeJob.length > 0
              ? <Bar data={partTimeJobData} options={partTimeJobOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>

        <Card padding="lg">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.sleepImpact')}</h3>
          <div
            className="chart-container"
            style={{ height: '300px', position: 'relative' }}
            role="img"
            aria-label={t('dashboard.chartAria', { title: t('admin.sleepImpact'), count: sleepImpact.length })}
          >
            {sleepImpact.length > 0
              ? <Bar data={sleepImpactData} options={sleepImpactOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>

        <Card padding="lg" className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.genderDistribution')}</h3>
          <div
            className="chart-container"
            style={{ height: '300px', position: 'relative' }}
            role="img"
            aria-label={t('dashboard.chartAria', { title: t('admin.genderDistribution'), count: genderDist.length })}
          >
            {genderDist.length > 0
              ? <Bar data={genderData} options={genderOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>

        <Card padding="lg" className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-primary-950 dark:text-gray-100 mb-4">{t('admin.parentalEduDistribution')}</h3>
          <div
            className="chart-container"
            style={{ height: '300px', position: 'relative' }}
            role="img"
            aria-label={t('dashboard.chartAria', { title: t('admin.parentalEduDistribution'), count: parentalEduDist.length })}
          >
            {parentalEduDist.length > 0
              ? <Bar data={parentalEduData} options={parentalEduOptions} />
              : <EmptyChart message={t('admin.noDataAvailable')} />}
          </div>
        </Card>
      </div>
    </div>
  );
}