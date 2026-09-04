import { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';
import { useTheme } from '../../hooks/useTheme';
import { getChartOptions, getMultiSeriesColors } from '../../utils/chartTheme';
import { createTrendChartData, formatMetric, getProgressStatusPresentation } from '../../utils/goalProgress';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

function ChartCard({ title, data, isDark, summary }) {
  const options = getChartOptions(isDark);
  return (
    <Card padding="lg" className="min-h-[330px]">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <figure className="mt-4">
        <div className="h-64">
          <Line
            data={data}
            options={{
              ...options,
              maintainAspectRatio: false,
              plugins: { ...options.plugins, legend: { display: false } },
            }}
            role="img"
            aria-label={summary}
          />
        </div>
        <figcaption className="sr-only">{summary}</figcaption>
      </figure>
    </Card>
  );
}

export default function ProgressCharts({ checkIns, progress }) {
  const { lang, t } = useLanguage();
  const { isDark } = useTheme();
  const seriesColors = useMemo(() => getMultiSeriesColors(isDark), [isDark]);
  const charts = useMemo(() => [
    {
      title: t('progress.scoreTrend'),
      data: createTrendChartData(checkIns, 'current_score', t('progress.latestScore'), seriesColors[0], lang),
    },
    {
      title: t('progress.studyHoursTrend'),
      data: createTrendChartData(checkIns, 'study_hours', t('progress.averageStudyHours'), seriesColors[1], lang),
    },
    {
      title: t('progress.attendanceTrend'),
      data: createTrendChartData(checkIns, 'attendance_percent', t('progress.averageAttendance'), seriesColors[2], lang),
    },
  ].filter((chart) => chart.data), [checkIns, lang, seriesColors, t]);
  const statusPresentation = getProgressStatusPresentation(progress?.status);
  const chartSummary = t('progress.textualSummary', {
    count: formatMetric(progress?.totalCheckIns, { digits: 0, language: lang }),
    status: t(statusPresentation.labelKey),
  });

  if (!charts.length) {
    return (
      <Card padding="lg" className="text-center">
        <h3 className="font-bold text-ink">{t('progress.charts')}</h3>
        <p className="mt-2 text-sm text-ink-muted">{t('progress.chartsEmpty')}</p>
      </Card>
    );
  }

  return (
    <section aria-labelledby="progress-charts-title">
      <h2 id="progress-charts-title" className="mb-4 text-lg font-bold text-ink">{t('progress.charts')}</h2>
      <div className="grid gap-5 xl:grid-cols-3">
        {charts.map((chart) => (
          <ChartCard
            key={chart.title}
            title={chart.title}
            data={chart.data}
            isDark={isDark}
            summary={`${chart.title}. ${chartSummary}`}
          />
        ))}
      </div>
    </section>
  );
}
