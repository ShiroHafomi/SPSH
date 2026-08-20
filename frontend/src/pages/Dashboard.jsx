/**
 * Dashboard Page - KPI cards, charts, and at-risk students
 */

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Scatter, Line, Doughnut } from 'react-chartjs-2';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { formatLabel } from '../utils/formatLabel';
import { MULTI_SERIES_COLORS, GRADE_COLORS, getChartOptions, getDoughnutOptions, getScatterOptions } from '../utils/chartTheme';
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
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);
  const [kpis, setKpis] = useState([]);
  const [atRisk, setAtRisk] = useState(null);
  const { isDark } = useTheme();

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
        if (mounted) console.error('Dashboard fetch error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
    return () => { mounted = false; };
  }, []);

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
              backgroundColor: seriesColor.solid + 'B3',
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
    getIcon('users') || <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg>,
    getIcon('award') || <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
    getIcon('barChart') || <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    getIcon('target') || <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
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
          variant: 'danger',
        });
      }
    });
    return list;
  }, [kpis, atRisk, t]);

  if (loading) {
    return (
      <div className="space-y-8" aria-busy="true" aria-label="Loading dashboard">
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
    <div className="space-y-8" role="main">
      {/* KPI Cards */}
      <div className="bento-grid-4" role="region" aria-label="Key Metrics">
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
            onClick={card.to ? undefined : () => {}}
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
                  att: atRisk.thresholds?.attendance || 75,
                  hrs: atRisk.thresholds?.studyHours || 2,
                  gpa: atRisk.thresholds?.gpa || 2.5,
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
              to="/students?at_risk=1"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-danger-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-danger-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 focus-visible:ring-offset-2"
              aria-label={t('dashboard.viewAtRiskStudents')}
            >
              {t('dashboard.viewStudents')}
            </Link>
          </div>
        </Card>
      )}

      {/* Charts Grid */}
      <div className="bento-grid-2" role="region" aria-label="Analytics Charts">
        {charts.map((chart, idx) => (
          <Card key={idx} padding="lg" className="min-h-[420px]">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <h3 className="text-lg font-bold text-primary-950 dark:text-white flex items-center gap-2">
                {formatLabel(chart.title)}
              </h3>
              {chart.xLabel && chart.yLabel && (
                <Badge variant="outline" size="sm" className="whitespace-nowrap">
                  <span className="truncate max-w-[100px]">{formatLabel(chart.xLabel)}</span>
                  <Icon name="chevronRight" className="w-3 h-3 flex-shrink-0 text-primary-400" />
                  <span className="truncate max-w-[100px]">{formatLabel(chart.yLabel)}</span>
                </Badge>
              )}
            </div>
            <div className="chart-container" style={{ height: '360px', position: 'relative' }}>
              {chart.chartType === 'bar' && <Bar data={chart.data} options={chart.options} />}
              {chart.chartType === 'scatter' && <Scatter data={chart.data} options={chart.options} />}
              {chart.chartType === 'line' && <Line data={chart.data} options={chart.options} />}
              {chart.chartType === 'doughnut' && <Doughnut data={chart.data} options={chart.options} />}
            </div>
          </Card>
        ))}

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