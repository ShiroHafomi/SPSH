import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock3,
  Database,
  Gauge,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../api';
import { DriftStatusBadge } from '../components/DriftStatusBadge';
import { Badge, Button, Card, GradeBadge, Input, Select, Skeleton } from '../components/ui';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { CHART_THEME, getChartOptions, getMultiSeriesColors } from '../utils/chartTheme';
import {
  DRIFT_FEATURES,
  EMPTY_VALUE,
  GRADES,
  PREDICTION_KINDS,
  buildCurrentPageCharts,
  createDefaultFilters,
  currentSampleRange,
  derivePageSummary,
  formatChartDateLabels,
  formatDate,
  formatDateTime,
  formatLatency,
  formatNumber,
  formatPercentage,
  formatPositiveInteger,
  getPredictionKindPresentation,
  normalizePagination,
  serializeDriftFilters,
  serializeHistoryFilters,
  shortenModelVersion,
  validateDateRange,
} from '../utils/mlMonitoring';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend
);

const pendingGets = new Map();
const GET_TIMEOUT_MS = 30_000;

function emptyHistoryState(filters = {}) {
  return {
    rows: [],
    page: Number.isSafeInteger(filters.page) && filters.page > 0 ? filters.page : 1,
    size: Number.isSafeInteger(filters.size) && filters.size > 0 ? filters.size : 20,
    total: 0,
    totalPages: 0,
  };
}

function coalescedGet(path) {
  if (pendingGets.has(path)) return pendingGets.get(path);

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('ML monitoring request timed out')), GET_TIMEOUT_MS);
  });
  const request = Promise.race([api.get(path), timeout])
    .finally(() => {
      window.clearTimeout(timeoutId);
      pendingGets.delete(path);
    });
  pendingGets.set(path, request);
  return request;
}

function SummaryCard({ icon: Icon, label, value, detail, children }) {
  return (
    <Card padding="sm" className="min-w-0 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-gray-400">{label}</p>
          {children || <p className="mt-1 break-words font-mono text-xl font-bold text-primary-950 dark:text-gray-100">{value}</p>}
          {detail && <p className="mt-1 text-xs text-primary-500 dark:text-gray-400">{detail}</p>}
        </div>
      </div>
    </Card>
  );
}

function ErrorState({ message, retryLabel, onRetry }) {
  return (
    <div className="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-danger-800 dark:border-danger-900/60 dark:bg-danger-950/30 dark:text-danger-200" role="alert">
      <p className="font-medium">{message}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {retryLabel}
      </Button>
    </div>
  );
}

function ChartCard({ title, scopeLabel, summary, data, type, isDark, xTitle, yTitle, stacked = false, emptyText }) {
  const baseOptions = getChartOptions(isDark);
  const options = {
    ...baseOptions,
    plugins: {
      ...baseOptions.plugins,
      legend: { ...baseOptions.plugins.legend, display: true },
    },
    scales: {
      x: {
        ...baseOptions.scales.x,
        stacked,
        title: { ...baseOptions.scales.x.title, display: true, text: xTitle },
      },
      y: {
        ...baseOptions.scales.y,
        stacked,
        title: { ...baseOptions.scales.y.title, display: true, text: yTitle },
      },
    },
  };
  const Chart = type === 'bar' ? Bar : Line;

  return (
    <Card padding="default" className="min-h-[350px] dark:bg-gray-900 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-bold text-primary-950 dark:text-gray-100">{title}</h3>
        <Badge variant="outline" size="sm">{scopeLabel}</Badge>
      </div>
      <p className="sr-only">{summary}</p>
      {data ? (
        <div className="mt-4 h-64" role="img" aria-label={summary}>
          <Chart data={data} options={options} />
        </div>
      ) : (
        <div className="mt-4 flex h-64 items-center justify-center rounded-2xl bg-primary-50 px-5 text-center text-sm text-primary-600 dark:bg-gray-800/60 dark:text-gray-300">
          {emptyText}
        </div>
      )}
    </Card>
  );
}

function HistoryLoading({ label }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {[1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-14 w-full rounded-xl" />)}
    </div>
  );
}

export default function MlMonitoring({ apiRole }) {
  const { t, lang } = useLanguage();
  const { isDark } = useTheme();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const initialFilters = useMemo(() => createDefaultFilters(), []);
  const [draft, setDraft] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [selectedModelVersion, setSelectedModelVersion] = useState(null);
  const [history, setHistory] = useState(() => emptyHistoryState(initialFilters));
  const [drift, setDrift] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [driftLoading, setDriftLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [driftError, setDriftError] = useState(false);
  const [dateError, setDateError] = useState(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [driftRetry, setDriftRetry] = useState(0);
  const driftSequence = useRef(0);
  const historySequence = useRef(0);
  const endpointBase = `/${apiRole}/ml`;

  useEffect(() => {
    const sequence = ++driftSequence.current;
    const query = serializeDriftFilters(applied);
    setDriftLoading(true);
    setDriftError(false);

    coalescedGet(`${endpointBase}/drift?${query}`)
      .then((report) => {
        if (sequence !== driftSequence.current) return;
        const version = shortenModelVersion(report?.modelVersion) !== EMPTY_VALUE
          ? report.modelVersion
          : null;
        if (!version) throw new Error('Invalid model version');
        setDrift(report);
        setHistoryLoading(true);
        setSelectedModelVersion(version);
      })
      .catch(() => {
        if (sequence !== driftSequence.current) return;
        historySequence.current += 1;
        setDrift(null);
        setSelectedModelVersion(null);
        setHistory(emptyHistoryState(applied));
        setHistoryLoading(false);
        setHistoryError(false);
        setDriftError(true);
      })
      .finally(() => {
        if (sequence === driftSequence.current) setDriftLoading(false);
      });

    return () => {
      if (sequence === driftSequence.current) driftSequence.current += 1;
    };
  }, [endpointBase, applied.from, applied.to, driftRetry]);

  useEffect(() => {
    if (!selectedModelVersion) {
      setHistory(emptyHistoryState(applied));
      setHistoryLoading(false);
      setHistoryError(false);
      return undefined;
    }

    const sequence = ++historySequence.current;
    const query = serializeHistoryFilters({ ...applied, modelVersion: selectedModelVersion });
    let pageCorrection = false;
    setHistory(emptyHistoryState(applied));
    setHistoryLoading(true);
    setHistoryError(false);

    coalescedGet(`${endpointBase}/predictions?${query}`)
      .then((response) => {
        if (sequence !== historySequence.current) return;
        const pagination = normalizePagination(response, applied);
        if (pagination.page !== applied.page) {
          pageCorrection = true;
          setHistory({ ...pagination, rows: [] });
          setApplied((current) => (
            current.page === applied.page
              ? { ...current, page: pagination.page }
              : current
          ));
          return;
        }

        const seenIds = new Set();
        const rows = Array.isArray(response?.rows)
          ? response.rows.filter((row) => {
            if (
              !Number.isSafeInteger(row?.id)
              || row.id <= 0
              || seenIds.has(row.id)
              || row.modelVersion !== selectedModelVersion
            ) {
              return false;
            }
            seenIds.add(row.id);
            return true;
          })
          : [];
        setHistory({ ...pagination, rows });
      })
      .catch(() => {
        if (sequence !== historySequence.current) return;
        setHistory(emptyHistoryState(applied));
        setHistoryError(true);
      })
      .finally(() => {
        if (sequence === historySequence.current && !pageCorrection) setHistoryLoading(false);
      });

    return () => {
      if (sequence === historySequence.current) historySequence.current += 1;
    };
  }, [endpointBase, selectedModelVersion, applied, historyRetry]);

  const applyFilters = useCallback((event) => {
    event.preventDefault();
    const validation = validateDateRange(draft.from, draft.to);
    setDateError(validation);
    if (validation) return;

    const next = { ...draft, page: 1 };
    const datesChanged = next.from !== applied.from || next.to !== applied.to;
    const needsDrift = datesChanged || !selectedModelVersion;
    if (needsDrift) {
      setDrift(null);
      setDriftLoading(true);
      setSelectedModelVersion(null);
      setDriftRetry((value) => value + 1);
    }
    setHistory(emptyHistoryState(next));
    setHistoryLoading(true);
    setHistoryError(false);
    setApplied(next);
  }, [applied.from, applied.to, draft, selectedModelVersion]);

  const resetFilters = useCallback(() => {
    const defaults = createDefaultFilters();
    const datesChanged = defaults.from !== applied.from || defaults.to !== applied.to;
    const needsDrift = datesChanged || !selectedModelVersion;
    setDraft(defaults);
    setDateError(null);
    if (needsDrift) {
      setDrift(null);
      setDriftLoading(true);
      setSelectedModelVersion(null);
      setDriftRetry((value) => value + 1);
    }
    setHistory(emptyHistoryState(defaults));
    setHistoryLoading(true);
    setHistoryError(false);
    setApplied(defaults);
  }, [applied.from, applied.to, selectedModelVersion]);

  const changePage = useCallback((page) => {
    if (historyLoading || page < 1 || page > history.totalPages) return;
    setHistory(emptyHistoryState({ ...applied, page }));
    setHistoryLoading(true);
    setHistoryError(false);
    setApplied((current) => ({ ...current, page }));
  }, [applied, historyLoading, history.totalPages]);

  const pageSummary = useMemo(() => derivePageSummary(history.rows), [history.rows]);
  const historySummaryUnavailable = historyLoading || historyError || !selectedModelVersion;
  const driftFeatures = useMemo(() => {
    const reported = Array.isArray(drift?.features) ? drift.features : [];
    return DRIFT_FEATURES
      .map((feature) => reported.find((entry) => entry?.feature === feature))
      .filter(Boolean);
  }, [drift]);
  const samples = useMemo(() => currentSampleRange(driftFeatures), [driftFeatures]);
  const sampleText = samples
    ? samples.minimum === samples.maximum
      ? formatNumber(samples.minimum, 0, locale)
      : `${formatNumber(samples.minimum, 0, locale)}–${formatNumber(samples.maximum, 0, locale)}`
    : EMPTY_VALUE;
  const rangeText = drift?.window
    ? `${formatDate(drift.window.from, locale)} – ${formatDate(drift.window.to, locale)}`
    : EMPTY_VALUE;

  const kindLabels = useMemo(() => Object.fromEntries(PREDICTION_KINDS.map((kind) => [
    kind,
    t(getPredictionKindPresentation(kind).labelKey),
  ])), [t]);
  const kindColors = useMemo(() => {
    const colors = getMultiSeriesColors(isDark);
    return {
      prediction: colors[1],
      feedback: colors[4],
      baseline: colors[5],
      simulation: colors[3],
    };
  }, [isDark]);
  const charts = useMemo(() => {
    const currentPageCharts = buildCurrentPageCharts(history.rows, kindLabels, kindColors);
    return {
      ...currentPageCharts,
      volume: formatChartDateLabels(currentPageCharts.volume, locale),
      confidence: formatChartDateLabels(currentPageCharts.confidence, locale),
      latency: formatChartDateLabels(currentPageCharts.latency, locale),
    };
  }, [history.rows, kindLabels, kindColors, locale]);

  const kindOptions = [
    { value: '', label: t('mlMonitoring.filters.allKinds') },
    ...PREDICTION_KINDS.map((kind) => ({ value: kind, label: kindLabels[kind] })),
  ];
  const gradeOptions = [
    { value: '', label: t('mlMonitoring.filters.allGrades') },
    ...GRADES.map((grade) => ({ value: grade, label: grade })),
  ];
  const sizeOptions = [20, 50, 100].map((size) => ({ value: size, label: String(size) }));
  const chartTheme = isDark ? CHART_THEME.dark : CHART_THEME.light;

  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              <Activity className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">{t('mlMonitoring.title')}</h1>
              <p className="mt-1 text-sm text-primary-600 dark:text-gray-400">{t('mlMonitoring.subtitle')}</p>
            </div>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setDrift(null);
            setDriftLoading(true);
            setSelectedModelVersion(null);
            setHistory(emptyHistoryState(applied));
            setHistoryLoading(true);
            setHistoryError(false);
            setDriftRetry((value) => value + 1);
          }}
          disabled={driftLoading || historyLoading}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('mlMonitoring.actions.refresh')}
        </Button>
      </header>

      <section aria-labelledby="monitoring-summary-title">
        <h2 id="monitoring-summary-title" className="sr-only">{t('mlMonitoring.summary.title')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={Database} label={t('mlMonitoring.summary.modelVersion')} detail={t('mlMonitoring.summary.latestModel')}>
            <p className="mt-1 truncate font-mono text-base font-bold text-primary-950 dark:text-gray-100" title={selectedModelVersion || undefined} aria-label={selectedModelVersion || undefined}>
              {shortenModelVersion(selectedModelVersion)}
            </p>
          </SummaryCard>
          <SummaryCard icon={BarChart3} label={t('mlMonitoring.summary.matchingEvents')} value={historySummaryUnavailable ? EMPTY_VALUE : formatNumber(history.total, 0, locale)} detail={t('mlMonitoring.summary.filteredWindow')} />
          <SummaryCard icon={Clock3} label={t('mlMonitoring.summary.averageLatency')} value={formatLatency(pageSummary.averageInferenceLatency, locale)} detail={t('mlMonitoring.scope.currentPage')} />
          <SummaryCard icon={Gauge} label={t('mlMonitoring.summary.averageConfidence')} value={formatPercentage(pageSummary.averageGradeConfidence, locale)} detail={t('mlMonitoring.scope.currentPage')} />
          <SummaryCard icon={BarChart3} label={t('mlMonitoring.summary.commonGrade')} detail={t('mlMonitoring.scope.currentPage')}>
            <div className="mt-2">{pageSummary.mostCommonGrade ? <GradeBadge grade={pageSummary.mostCommonGrade} /> : EMPTY_VALUE}</div>
          </SummaryCard>
          <SummaryCard icon={ShieldCheck} label={t('mlMonitoring.summary.overallDrift')}>
            <div className="mt-2">{drift ? <DriftStatusBadge status={drift.overallStatus} t={t} /> : EMPTY_VALUE}</div>
          </SummaryCard>
          <SummaryCard icon={Database} label={t('mlMonitoring.summary.currentSamples')} value={sampleText} detail={t('mlMonitoring.summary.featureSampleRange')} />
          <SummaryCard icon={CalendarDays} label={t('mlMonitoring.summary.monitoringRange')} value={rangeText} />
        </div>
      </section>

      <Card padding="default" className="dark:bg-gray-900 dark:border-gray-800">
        <form onSubmit={applyFilters} noValidate>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-primary-950 dark:text-gray-100">{t('mlMonitoring.filters.title')}</h2>
              <p className="text-sm text-primary-500 dark:text-gray-400">{t('mlMonitoring.filters.description')}</p>
            </div>
            <p className="max-w-xl text-xs text-primary-500 dark:text-gray-400">{t('mlMonitoring.filters.modelPolicy')}</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Input
              id="ml-monitoring-from"
              type="date"
              label={t('mlMonitoring.filters.from')}
              value={draft.from}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
              error={dateError ? t(`mlMonitoring.validation.${dateError}`) : undefined}
            />
            <Input
              id="ml-monitoring-to"
              type="date"
              label={t('mlMonitoring.filters.to')}
              value={draft.to}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
            />
            <Select
              id="ml-monitoring-kind"
              label={t('mlMonitoring.filters.kind')}
              value={draft.kind}
              options={kindOptions}
              onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}
            />
            <Select
              id="ml-monitoring-grade"
              label={t('mlMonitoring.filters.grade')}
              value={draft.grade}
              options={gradeOptions}
              onChange={(event) => setDraft((current) => ({ ...current, grade: event.target.value }))}
            />
            <Select
              id="ml-monitoring-size"
              label={t('mlMonitoring.filters.pageSize')}
              value={draft.size}
              options={sizeOptions}
              onChange={(event) => setDraft((current) => ({ ...current, size: Number(event.target.value) }))}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" loading={driftLoading || historyLoading} aria-label={driftLoading || historyLoading ? t('mlMonitoring.actions.applying') : t('mlMonitoring.actions.apply')}>{t('mlMonitoring.actions.apply')}</Button>
            <Button variant="ghost" onClick={resetFilters} disabled={driftLoading || historyLoading}>{t('mlMonitoring.actions.reset')}</Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="history-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="history-title" className="text-xl font-bold text-primary-950 dark:text-gray-100">{t('mlMonitoring.history.title')}</h2>
            <p className="text-sm text-primary-500 dark:text-gray-400">{t('mlMonitoring.history.privacy')}</p>
          </div>
          <p className="text-sm text-primary-600 dark:text-gray-300" aria-live="polite">
            {t('mlMonitoring.pagination.summary', {
              page: history.page,
              totalPages: history.totalPages || 1,
              total: history.total,
            })}
          </p>
        </div>

        {historyError ? (
          <ErrorState
            message={t('mlMonitoring.errors.history')}
            retryLabel={t('mlMonitoring.actions.retry')}
            onRetry={() => {
              setHistoryLoading(true);
              setHistoryError(false);
              setHistoryRetry((value) => value + 1);
            }}
          />
        ) : historyLoading || driftLoading ? (
          <HistoryLoading label={t('mlMonitoring.loading.history')} />
        ) : !selectedModelVersion ? (
          <Card padding="lg" className="text-center dark:bg-gray-900 dark:border-gray-800">
            <p className="font-semibold text-primary-900 dark:text-gray-100">{t('mlMonitoring.empty.modelUnavailable')}</p>
            <p className="mt-1 text-sm text-primary-500 dark:text-gray-400">{t('mlMonitoring.empty.modelUnavailableDescription')}</p>
          </Card>
        ) : history.rows.length === 0 ? (
          <Card padding="lg" className="text-center dark:bg-gray-900 dark:border-gray-800">
            <p className="font-semibold text-primary-900 dark:text-gray-100">{t('mlMonitoring.empty.history')}</p>
            <p className="mt-1 text-sm text-primary-500 dark:text-gray-400">{t('mlMonitoring.empty.historyDescription')}</p>
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden dark:bg-gray-900 dark:border-gray-800">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px]">
                <thead className="bg-primary-50 text-left text-xs uppercase tracking-wide text-primary-600 dark:bg-gray-800 dark:text-gray-300">
                  <tr>
                    {['time', 'kind', 'model', 'score', 'grade', 'confidence', 'latency', 'student'].map((column) => (
                      <th key={column} scope="col" className="px-4 py-3 font-semibold">{t(`mlMonitoring.history.columns.${column}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100 dark:divide-gray-800">
                  {history.rows.map((row) => {
                    const kind = getPredictionKindPresentation(row.predictionKind);
                    return (
                      <tr key={row.id} className="text-sm text-primary-800 hover:bg-primary-50/70 dark:text-gray-200 dark:hover:bg-gray-800/60">
                        <td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.createdAt, locale)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={kind.variant} size="sm">{t(kind.labelKey)}</Badge>
                          <span className="mt-1 block text-xs text-primary-500 dark:text-gray-400">{t(kind.production ? 'mlMonitoring.kinds.productionScope' : 'mlMonitoring.kinds.nonProductionScope')}</span>
                        </td>
                        <td className="px-4 py-3 font-mono" title={row.modelVersion || undefined} aria-label={row.modelVersion || undefined}>{shortenModelVersion(row.modelVersion)}</td>
                        <td className="px-4 py-3 font-mono">{formatNumber(row.predictedScore, 2, locale)}</td>
                        <td className="px-4 py-3">{GRADES.includes(row.predictedGrade) ? <GradeBadge grade={row.predictedGrade} size="sm" /> : EMPTY_VALUE}</td>
                        <td className="px-4 py-3 font-mono">{formatPercentage(row.gradeConfidence, locale)}</td>
                        <td className="px-4 py-3 font-mono">{formatLatency(row.inferenceLatencyMs, locale)}</td>
                        <td className="px-4 py-3 font-mono">{formatPositiveInteger(row.studentId, locale)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-primary-100 md:hidden dark:divide-gray-800">
              {history.rows.map((row) => {
                const kind = getPredictionKindPresentation(row.predictionKind);
                return (
                  <article key={row.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-primary-950 dark:text-gray-100">{formatDateTime(row.createdAt, locale)}</p>
                        <p className="mt-1 break-all font-mono text-xs text-primary-500 dark:text-gray-400" title={row.modelVersion || undefined} aria-label={row.modelVersion || undefined}>{shortenModelVersion(row.modelVersion)}</p>
                      </div>
                      <Badge variant={kind.variant} size="sm">{t(kind.labelKey)}</Badge>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-primary-500 dark:text-gray-400">{t('mlMonitoring.history.columns.score')}</dt><dd className="font-mono text-primary-900 dark:text-gray-100">{formatNumber(row.predictedScore, 2, locale)}</dd></div>
                      <div><dt className="text-primary-500 dark:text-gray-400">{t('mlMonitoring.history.columns.grade')}</dt><dd>{GRADES.includes(row.predictedGrade) ? <GradeBadge grade={row.predictedGrade} size="sm" /> : EMPTY_VALUE}</dd></div>
                      <div><dt className="text-primary-500 dark:text-gray-400">{t('mlMonitoring.history.columns.confidence')}</dt><dd className="font-mono text-primary-900 dark:text-gray-100">{formatPercentage(row.gradeConfidence, locale)}</dd></div>
                      <div><dt className="text-primary-500 dark:text-gray-400">{t('mlMonitoring.history.columns.latency')}</dt><dd className="font-mono text-primary-900 dark:text-gray-100">{formatLatency(row.inferenceLatencyMs, locale)}</dd></div>
                    </dl>
                    <p className="text-xs text-primary-500 dark:text-gray-400">{t(kind.production ? 'mlMonitoring.kinds.productionScope' : 'mlMonitoring.kinds.nonProductionScope')}</p>
                  </article>
                );
              })}
            </div>
          </Card>
        )}

        {history.totalPages > 1 && (
          <nav className="flex items-center justify-end gap-3" aria-label={t('mlMonitoring.pagination.label')}>
            <Button variant="secondary" size="sm" onClick={() => changePage(history.page - 1)} disabled={historyLoading || history.page <= 1}>{t('mlMonitoring.pagination.previous')}</Button>
            <span className="text-sm font-medium text-primary-700 dark:text-gray-300">{t('mlMonitoring.pagination.pageOf', { page: history.page, totalPages: history.totalPages })}</span>
            <Button variant="secondary" size="sm" onClick={() => changePage(history.page + 1)} disabled={historyLoading || history.page >= history.totalPages}>{t('mlMonitoring.pagination.next')}</Button>
          </nav>
        )}
      </section>

      <section aria-labelledby="trends-title" className="space-y-4">
        <div>
          <h2 id="trends-title" className="text-xl font-bold text-primary-950 dark:text-gray-100">{t('mlMonitoring.charts.title')}</h2>
          <p className="text-sm text-primary-500 dark:text-gray-400">{t('mlMonitoring.charts.scopeExplanation')}</p>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <ChartCard title={t('mlMonitoring.charts.volume')} scopeLabel={t('mlMonitoring.scope.currentPage')} summary={t('mlMonitoring.charts.volumeSummary', { count: history.rows.length })} data={charts.volume} type="bar" isDark={isDark} xTitle={t('mlMonitoring.charts.axes.date')} yTitle={t('mlMonitoring.charts.axes.events')} stacked emptyText={t('mlMonitoring.charts.insufficient')} />
          <ChartCard title={t('mlMonitoring.charts.confidence')} scopeLabel={t('mlMonitoring.scope.currentPage')} summary={t('mlMonitoring.charts.confidenceSummary', { count: history.rows.length })} data={charts.confidence} type="line" isDark={isDark} xTitle={t('mlMonitoring.charts.axes.date')} yTitle={t('mlMonitoring.charts.axes.confidence')} emptyText={t('mlMonitoring.charts.insufficientTrend')} />
          <ChartCard title={t('mlMonitoring.charts.latency')} scopeLabel={t('mlMonitoring.scope.currentPage')} summary={t('mlMonitoring.charts.latencySummary', { count: history.rows.length })} data={charts.latency} type="line" isDark={isDark} xTitle={t('mlMonitoring.charts.axes.date')} yTitle={t('mlMonitoring.charts.axes.latency')} emptyText={t('mlMonitoring.charts.insufficientTrend')} />
          <ChartCard title={t('mlMonitoring.charts.grades')} scopeLabel={t('mlMonitoring.scope.currentPage')} summary={t('mlMonitoring.charts.gradesSummary', { count: history.rows.length })} data={charts.grades} type="bar" isDark={isDark} xTitle={t('mlMonitoring.charts.axes.grade')} yTitle={t('mlMonitoring.charts.axes.events')} stacked emptyText={t('mlMonitoring.charts.insufficient')} />
        </div>
      </section>

      <section aria-labelledby="drift-title" className="space-y-4">
        <div>
          <h2 id="drift-title" className="text-xl font-bold text-primary-950 dark:text-gray-100">{t('mlMonitoring.drift.title')}</h2>
          <p className="text-sm text-primary-500 dark:text-gray-400">{t('mlMonitoring.drift.explanation')}</p>
        </div>
        {driftError ? (
          <ErrorState
            message={t('mlMonitoring.errors.drift')}
            retryLabel={t('mlMonitoring.actions.retry')}
            onRetry={() => {
              setDriftLoading(true);
              setHistoryLoading(true);
              setDriftRetry((value) => value + 1);
            }}
          />
        ) : driftLoading ? (
          <div className="grid gap-4 md:grid-cols-2" role="status" aria-live="polite">
            <span className="sr-only">{t('mlMonitoring.loading.drift')}</span>
            {[1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-44 rounded-2xl" />)}
          </div>
        ) : drift ? (
          <>
            <Card padding="default" className={`dark:bg-gray-900 dark:border-gray-800 ${drift.overallStatus === 'insufficient_data' ? 'border-warning-300 dark:border-warning-900/70' : ''}`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary-500 dark:text-gray-400">{t('mlMonitoring.drift.overall')}</p>
                  <div className="mt-2"><DriftStatusBadge status={drift.overallStatus} t={t} size="lg" /></div>
                </div>
                <dl className="grid gap-4 text-sm sm:grid-cols-3">
                  <div><dt className="text-primary-500 dark:text-gray-400">{t('mlMonitoring.drift.method')}</dt><dd className="mt-1 font-medium text-primary-900 dark:text-gray-100">{drift.method === 'absolute_standardized_mean_shift' ? t('mlMonitoring.drift.methodName') : EMPTY_VALUE}</dd></div>
                  <div><dt className="text-primary-500 dark:text-gray-400">{t('mlMonitoring.drift.minimumSamples')}</dt><dd className="mt-1 font-mono font-medium text-primary-900 dark:text-gray-100">{formatNumber(drift.minimumSampleSize, 0, locale)}</dd></div>
                  <div><dt className="text-primary-500 dark:text-gray-400">{t('mlMonitoring.drift.window')}</dt><dd className="mt-1 font-medium text-primary-900 dark:text-gray-100">{rangeText}</dd></div>
                </dl>
              </div>
              {drift.overallStatus === 'insufficient_data' && <p className="mt-4 rounded-xl bg-warning-50 p-3 text-sm text-warning-800 dark:bg-warning-950/30 dark:text-warning-200">{t('mlMonitoring.drift.insufficientNotice')}</p>}
            </Card>

            <Card padding="none" className="overflow-hidden dark:bg-gray-900 dark:border-gray-800">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px]">
                  <thead className="bg-primary-50 text-left text-xs uppercase tracking-wide text-primary-600 dark:bg-gray-800 dark:text-gray-300">
                    <tr>
                      {['feature', 'status', 'baselineCount', 'currentCount', 'baselineMean', 'currentMean', 'baselineDeviation', 'shift', 'thresholds'].map((column) => (
                        <th key={column} scope="col" className="px-4 py-3 font-semibold">{t(`mlMonitoring.drift.columns.${column}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-100 dark:divide-gray-800">
                    {driftFeatures.map((feature) => (
                      <tr key={feature.feature} className="text-sm text-primary-800 dark:text-gray-200">
                        <th scope="row" className="whitespace-nowrap px-4 py-4 text-left font-semibold">{t(`mlMonitoring.features.${feature.feature}`)}</th>
                        <td className="px-4 py-4"><DriftStatusBadge status={feature.status} t={t} /></td>
                        <td className="px-4 py-4 font-mono">{formatNumber(feature.baselineSampleCount, 0, locale)}</td>
                        <td className="px-4 py-4 font-mono">{formatNumber(feature.currentSampleCount, 0, locale)}</td>
                        <td className="px-4 py-4 font-mono">{formatNumber(feature.baselineMean, 3, locale)}</td>
                        <td className="px-4 py-4 font-mono">{formatNumber(feature.currentMean, 3, locale)}</td>
                        <td className="px-4 py-4 font-mono">{formatNumber(feature.baselineStandardDeviation, 3, locale)}</td>
                        <td className="px-4 py-4 font-mono font-semibold">{formatNumber(feature.standardizedMeanShift, 3, locale)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs">
                          {t('mlMonitoring.drift.thresholdValues', {
                            warning: formatNumber(feature.thresholds?.stableBelow, 2, locale),
                            drifted: formatNumber(feature.thresholds?.driftedAtOrAbove, 2, locale),
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="rounded-2xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
              {t('mlMonitoring.drift.shiftExplanation')}
            </p>
          </>
        ) : null}
      </section>

      <aside className="flex items-start gap-3 rounded-2xl border border-primary-200 bg-white p-4 text-sm text-primary-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: chartTheme.success.border }} aria-hidden="true" />
        <p>{t('mlMonitoring.privacy')}</p>
      </aside>
    </div>
  );
}
