import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { api } from '../api';
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  GradeBadge,
  Icon,
  PageHeader,
  SkeletonCard,
  SkeletonChart,
} from '../components/ui';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { CHART_THEME, getChartOptions } from '../utils/chartTheme';
import { formatTrendChange, normalizePerformanceTrend } from '../utils/studentPerformanceTrend';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const STATUS_VARIANTS = {
  Improving: 'success',
  Stable: 'info',
  Declining: 'warning',
};

function formatNumber(value, locale) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value, locale) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
    : '—';
}

function MetricCard({ icon, label, value, detail, valueClassName = 'text-ink' }) {
  return (
    <Card padding="sm" className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</p>
          <div className={`mt-3 font-mono text-3xl font-bold tabular-nums ${valueClassName}`}>{value}</div>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-action-muted text-action-strong" aria-hidden="true">
          <Icon name={icon} className="size-5" />
        </span>
      </div>
      {detail && <p className="mt-3 text-sm text-ink-muted">{detail}</p>}
    </Card>
  );
}

export default function StudentPerformanceTrend() {
  const { lang, t } = useLanguage();
  const { isDark } = useTheme();
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef(null);
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  const loadTrend = useCallback(async () => {
    const requestId = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(false);
    try {
      const response = await api.get('/student/me/performance-trend', { signal: controller.signal });
      if (requestId !== requestRef.current) return;
      setTrend(normalizePerformanceTrend(response));
    } catch {
      if (requestId !== requestRef.current) return;
      setTrend(null);
      setError(true);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrend();
    return () => {
      requestRef.current += 1;
      abortRef.current?.abort();
    };
  }, [loadTrend]);

  const chartData = useMemo(() => {
    if (!trend?.scoreRows.length) return null;
    const theme = isDark ? CHART_THEME.dark : CHART_THEME.light;
    return {
      labels: trend.scoreRows.map((row) => formatDate(row.createdAt, locale)),
      datasets: [{
        label: t('studentPerformanceTrend.predictedScore'),
        data: trend.scoreRows.map((row) => row.predictedScore),
        borderColor: theme.primary.border,
        backgroundColor: theme.primary.bg,
        pointBackgroundColor: theme.primary.solid,
        pointBorderColor: theme.background,
        fill: true,
      }],
    };
  }, [isDark, locale, t, trend]);

  const chartOptions = useMemo(() => {
    const baseOptions = getChartOptions(isDark);
    const theme = isDark ? CHART_THEME.dark : CHART_THEME.light;
    return {
      ...baseOptions,
      plugins: {
        ...baseOptions.plugins,
        legend: { ...baseOptions.plugins.legend, display: true },
      },
      scales: {
        ...baseOptions.scales,
        y: {
          ...baseOptions.scales.y,
          max: 100,
          title: {
            ...baseOptions.scales.y.title,
            display: true,
            text: t('studentPerformanceTrend.scoreAxis'),
            color: theme.textMuted,
          },
        },
        x: {
          ...baseOptions.scales.x,
          title: {
            ...baseOptions.scales.x.title,
            display: true,
            text: t('studentPerformanceTrend.dateAxis'),
            color: theme.textMuted,
          },
        },
      },
    };
  }, [isDark, t]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-5" aria-busy="true" aria-label={t('studentPerformanceTrend.loading')}>
        <SkeletonCard />
        <SkeletonChart />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl space-y-5">
        <PageHeader title={t('studentPerformanceTrend.title')} subtitle={t('studentPerformanceTrend.subtitle')} />
        <ErrorState
          title={t('studentPerformanceTrend.error')}
          description={t('studentPerformanceTrend.errorDescription')}
          action={loadTrend}
          actionLabel={t('studentPerformanceTrend.retry')}
        />
      </div>
    );
  }

  if (!trend?.hasData) {
    return (
      <div className="mx-auto max-w-7xl space-y-5">
        <PageHeader title={t('studentPerformanceTrend.title')} subtitle={t('studentPerformanceTrend.subtitle')} />
        <EmptyState
          icon="activity"
          title={t('studentPerformanceTrend.empty')}
          description={t('studentPerformanceTrend.emptyDescription')}
        />
      </div>
    );
  }

  const changeText = formatTrendChange(trend.change, (value) => formatNumber(value, locale));
  const statusVariant = STATUS_VARIANTS[trend.trendStatus] || 'info';
  const statusLabel = t(`studentPerformanceTrend.status${trend.trendStatus}`);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title={t('studentPerformanceTrend.title')}
        subtitle={t('studentPerformanceTrend.subtitle')}
      />

      <Card padding="default" className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-action-muted text-action-strong" aria-hidden="true">
            <Icon name="activity" className="size-6" />
          </span>
          <div>
            <p className="text-sm text-ink-muted">{t('studentPerformanceTrend.statusLabel')}</p>
            <h2 className="text-xl font-bold text-ink">{statusLabel}</h2>
          </div>
        </div>
        <Badge variant={statusVariant} size="lg" dot>{statusLabel}</Badge>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon="lineChart"
          label={t('studentPerformanceTrend.latestScore')}
          value={formatNumber(trend.latestScore, locale)}
          detail={t('studentPerformanceTrend.scoreOutOf100')}
        />
        <MetricCard
          icon="clock"
          label={t('studentPerformanceTrend.previousScore')}
          value={formatNumber(trend.previousScore, locale)}
          detail={t('studentPerformanceTrend.previousDetail')}
        />
        <MetricCard
          icon={trend.change > 0 ? 'trendingUp' : trend.change < 0 ? 'trendingDown' : 'minus'}
          label={t('studentPerformanceTrend.change')}
          value={changeText || '—'}
          detail={t('studentPerformanceTrend.changeDetail')}
          valueClassName={trend.change > 0 ? 'text-success-700 dark:text-success-300' : trend.change < 0 ? 'text-danger-700 dark:text-danger-300' : 'text-ink'}
        />
        <MetricCard
          icon="sparkles"
          label={t('studentPerformanceTrend.predictedScore')}
          value={formatNumber(trend.predictedScore, locale)}
          detail={t('studentPerformanceTrend.predictedDetail')}
        />
      </div>

      <Card padding="default" className="min-h-[350px]">
        <CardHeader>
          <div>
            <CardTitle>{t('studentPerformanceTrend.scoreTrend')}</CardTitle>
            <CardDescription>{t('studentPerformanceTrend.scoreTrendDescription')}</CardDescription>
          </div>
          <Badge variant="outline" size="sm">{t('studentPerformanceTrend.historyCount', { count: trend.scoreRows.length })}</Badge>
        </CardHeader>
        {chartData ? (
          <div className="h-72" role="img" aria-label={t('studentPerformanceTrend.chartSummary', { count: trend.scoreRows.length })}>
            <Line data={chartData} options={chartOptions} />
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-surface-muted text-center text-sm text-ink-muted">
            {t('studentPerformanceTrend.noScores')}
          </div>
        )}
      </Card>

      <Card padding="default">
        <CardHeader>
          <div>
            <CardTitle>{t('studentPerformanceTrend.gradeTrend')}</CardTitle>
            <CardDescription>{t('studentPerformanceTrend.gradeTrendDescription')}</CardDescription>
          </div>
        </CardHeader>
        {trend.gradeRows.length ? (
          <div className="flex gap-3 overflow-x-auto pb-2" aria-label={t('studentPerformanceTrend.gradeTrend')}>
            {trend.gradeRows.map((row) => (
              <div key={`${row.id}-${row.createdAt}`} className="flex min-w-24 shrink-0 flex-col items-center gap-2 rounded-xl border border-divider bg-surface-muted p-3">
                <GradeBadge grade={row.predictedGrade} size="lg" />
                <span className="text-center text-xs text-ink-muted">{formatDate(row.createdAt, locale)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t('studentPerformanceTrend.noGrades')}</p>
        )}
      </Card>
    </div>
  );
}
