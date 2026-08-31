/**
 * Dashboard Page - KPI cards, charts, and at-risk students
 */

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Scatter, Line, Doughnut } from 'react-chartjs-2';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { formatLabel } from '../utils/formatLabel';
import { CHART_THEME, GRADE_COLORS, getChartOptions, getDoughnutOptions, getMultiSeriesColors, getScatterOptions } from '../utils/chartTheme';
import {
  Card,
  KPICard,
  Badge,
  Icon,
  getIcon,
  SkeletonCard,
  SkeletonChart,
  Button,
} from '../components/ui';

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

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);
  const [kpis, setKpis] = useState([]);
  const [atRisk, setAtRisk] = useState(null);
  const { isDark } = useTheme();
  const canManageStudents = user?.role === 'admin' || user?.role === 'teacher';
  const studentListPath = user?.role === 'admin' ? '/admin/students' : '/teacher/students';
  const atRiskPath = user?.role === 'admin' ? '/admin/at-risk' : '/teacher/at-risk';
  const chartTheme = isDark ? CHART_THEME.dark : CHART_THEME.light;
  const seriesColors = useMemo(() => getMultiSeriesColors(isDark), [isDark]);

  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      setLoading(true);
      try {
        const [statsData, atRiskData] = await Promise.all([
          api.get('/dashboard/stats'),
          canManageStudents ? api.get('/dashboard/at-risk').catch(() => null) : Promise.resolve(null),
        ]);
        if (mounted) {
          setKpis(statsData.chartData.kpis);
          setChartData(statsData.chartData.charts);
          setAtRisk(atRiskData);
        }
      } catch (err) {
        if (mounted) console.error('Dashboard fetch error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
    return () => { mounted = false; };
  }, [canManageStudents]);

  // Transform chart data from API to Chart.js format
  const charts = useMemo(() => {
    if (!chartData) return [];
    return chartData.map((chart, idx) => {
      const seriesColor = seriesColors[idx % seriesColors.length];

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
              label: formatLabel(chart.yLabel || t('common.value')),
              data: sorted.map(d => d.value),
              backgroundColor: seriesColor.bg,
              borderColor: seriesColor.border,
              borderWidth: 1,
              borderRadius: 4,
              borderSkipped: 'start',
              maxBarThickness: 24,
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
              label: `${formatLabel(chart.yLabel)} ${t('common.versus')} ${formatLabel(chart.xLabel)}`,
              data: chart.data.map(d => ({ x: d.x, y: d.y })),
              backgroundColor: seriesColor.solid + 'B3',
              borderColor: seriesColor.solid,
              borderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointHitRadius: 12,
              pointBorderWidth: 2,
              pointBorderColor: chartTheme.background,
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
              label: formatLabel(chart.yLabel || t('common.value')),
              data: chart.data,
              backgroundColor: seriesColor.bg,
              borderColor: seriesColor.border,
              borderWidth: 2,
              fill: true,
              tension: 0.25,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointHitRadius: 12,
              pointBackgroundColor: seriesColor.solid,
              pointBorderColor: chartTheme.background,
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

        return {
          ...chart,
          chartType: 'doughnut',
          data: {
            labels: chart.labels.map(l => `${t('common.grade')} ${l}`),
            datasets: [{
              data: chart.data,
              backgroundColor: backgrounds,
              borderColor: chartTheme.background,
              borderWidth: 2,
              borderAlign: 'inner',
              hoverOffset: 6,
              hoverBorderWidth: 2,
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
            label: formatLabel(chart.yLabel || t('common.value')),
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
  }, [chartData, chartTheme.background, isDark, seriesColors, t]);

  // KPI Cards configuration
  const icons = [
    getIcon('users') || null,
    getIcon('award') || null,
    getIcon('barChart') || null,
    getIcon('target') || null,
  ];

  const cards = useMemo(() => {
    const atRiskCount = atRisk && typeof atRisk.count === 'number' ? atRisk.count : 0;
    const list = [];
    kpis.forEach((kpi) => {
      const isTotal = kpi.key === 'total';
      list.push({
        ...kpi,
        featured: isTotal,
        to: isTotal && canManageStudents ? studentListPath : undefined,
      });
      if (isTotal && canManageStudents) {
        list.push({
          label: t('dashboard.atRiskCard'),
          key: 'at_risk',
          value: atRiskCount,
          format: 'int',
          to: atRiskPath,
          featured: true,
          variant: 'danger',
        });
      }
    });
    return list;
  }, [atRisk, atRiskPath, canManageStudents, kpis, studentListPath, t]);

  if (loading) {
    return (
      <div className="space-y-8" role="status" aria-busy="true" aria-label={t('dashboard.loading')}>
        <div className="bento-grid-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="bento-grid-2">
          {[...Array(3)].map((_, i) => <SkeletonChart key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="bento-grid-4" role="region" aria-label={t('dashboard.keyMetrics')}>
        {cards.map((card, idx) => (
          <KPICard
            key={card.key || idx}
            label={card.label}
            value={card.value}
            format={card.format}
            icon={card.featured ? undefined : icons[idx < 4 ? idx : idx - 1]}
            featured={card.featured}
            variant={card.variant || 'primary'}
            to={card.to}
          />
        ))}
      </div>

      {/* At-Risk Students Warning */}
      {atRisk && atRisk.count > 0 && (
        <Card variant="default" className="border-l-4 border-danger-500 bg-danger-50/30 dark:bg-danger-950/20" role="alert" aria-live="polite">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-10 h-10 rounded-xl bg-danger-100 dark:bg-danger-900/40 text-danger-600 dark:text-danger-400 flex items-center justify-center flex-shrink-0">
                  <Icon name="alertTriangle" className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-danger-700 dark:text-danger-400">
                  {atRisk.count} {atRisk.count === 1 ? t('dashboard.studentSingular') : t('dashboard.studentPlural')} {t('dashboard.atRiskLabel')}
                </h3>
              </div>
              <p className="text-sm text-danger-600 dark:text-danger-400/80 mb-3 ml-12">
                {t('dashboard.atRiskMessage', {
                  att: atRisk.thresholds?.attendance ?? 75,
                  hrs: atRisk.thresholds?.studyHours ?? 2,
                  gpa: atRisk.thresholds?.gpa ?? 2.5,
                })}
              </p>
              <div className="flex flex-wrap gap-1.5 ml-12">
                {atRisk.students.slice(0, 8).map((s) => (
                  <Badge key={s.id} variant="primary" size="sm" className="dark:bg-primary-900/40">
                    #{s.id}
                  </Badge>
                ))}
                {atRisk.students.length > 8 && (
                  <Badge variant="outline" size="sm">
                    +{atRisk.students.length - 8} {t('dashboard.more')}
                  </Badge>
                )}
              </div>
            </div>
            <Link
              to={atRiskPath}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-danger-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-danger-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 focus-visible:ring-offset-2"
              aria-label={t('dashboard.viewAtRiskStudents')}
            >
              {t('dashboard.viewStudents')}
            </Link>
          </div>
        </Card>
      )}

      {/* Charts Grid */}
      <div className="bento-grid-2" role="region" aria-label={t('dashboard.analyticsCharts')}>
        {charts.map((chart, idx) => {
          const chartTitle = formatLabel(chart.title);
          const dataPointCount = chart.data.datasets.reduce(
            (total, dataset) => total + dataset.data.filter((value) => value != null).length,
            0
          );

          return (
            <Card key={chart.key || idx} padding="lg" className="min-h-[420px]">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <h3 className="text-lg font-bold text-primary-950 dark:text-white flex items-center gap-2">
                  {chartTitle}
                </h3>
                {chart.xLabel && chart.yLabel && (
                  <Badge variant="outline" size="sm" className="whitespace-nowrap">
                    <span className="truncate max-w-[100px]">{formatLabel(chart.xLabel)}</span>
                    <Icon name="chevronRight" className="w-3 h-3 flex-shrink-0 text-primary-400" />
                    <span className="truncate max-w-[100px]">{formatLabel(chart.yLabel)}</span>
                  </Badge>
                )}
              </div>
              <div
                className="chart-container"
                style={{ height: '360px', position: 'relative' }}
                role="img"
                aria-label={t('dashboard.chartAria', { title: chartTitle, count: dataPointCount })}
              >
                {chart.chartType === 'bar' && <Bar data={chart.data} options={chart.options} />}
                {chart.chartType === 'scatter' && <Scatter data={chart.data} options={chart.options} />}
                {chart.chartType === 'line' && <Line data={chart.data} options={chart.options} />}
                {chart.chartType === 'doughnut' && <Doughnut data={chart.data} options={chart.options} />}
              </div>
            </Card>
          );
        })}

        {!charts.length && (
          <Card padding="lg" className="col-span-full text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-primary-100 dark:bg-primary-900/40 text-primary-400 dark:text-primary-600 flex items-center justify-center">
              <Icon name="barChart" className="w-8 h-8" />
            </div>
            <p className="text-primary-400 dark:text-primary-600 font-medium text-lg">{t('dashboard.noChartData')}</p>
            <p className="text-sm text-primary-400/70 dark:text-primary-600/70 mt-2 max-w-xs mx-auto">
              {t('dashboard.noChartDataDesc')}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}