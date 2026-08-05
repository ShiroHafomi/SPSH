import { useEffect, useState, useMemo } from 'react';
import { useFlash } from '../components/FlashProvider';
import { api } from '../api';
import { Chart, registerables } from 'chart.js';
import { Bar, Scatter } from 'react-chartjs-2';
import { SkeletonChart } from '../components/Skeleton';

Chart.register(...registerables);

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { usePointStyle: true, padding: 16 } },
  },
};

export default function Dashboard() {
  const { addFlash } = useFlash();
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);
  const [kpis, setKpis] = useState([]);
  const [atRisk, setAtRisk] = useState(null);

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
        if (mounted) {
          addFlash(err.message, 'error');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
    return () => { mounted = false; };
  }, [addFlash]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[...Array(3)].map((_, i) => <SkeletonChart key={i} />)}
        </div>
      </div>
    );
  }

  const formatKPI = (value, format) => {
    if (value === null || value === undefined) return '—';
    const num = Number(value);
    if (isNaN(num)) return value;
    if (format === 'pct') return num.toFixed(1) + '%';
    if (format === 'dec1') return num.toFixed(1);
    return num.toLocaleString();
  };

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
                Low attendance (&lt;{atRisk.thresholds?.attendance || 75}%), study hours (&lt;{atRisk.thresholds?.studyHours || 2}h), or GPA (&lt;{atRisk.thresholds?.gpa || 2.5}).
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
        {chartData?.map((chart, idx) => (
          <div key={idx} className="card p-6">
            <h3 className="text-lg font-bold text-primary-950 dark:text-gray-100 mb-4">{chart.title}</h3>
            <div className="chart-container">
              {chart.type === 'bar' && (
                <Bar
                  data={{
                    labels: chart.labels,
                    datasets: [{
                      label: chart.yLabel || 'Value',
                      data: chart.data,
                      backgroundColor: 'rgba(99, 102, 241, 0.7)',
                      borderColor: 'rgb(99, 102, 241)',
                      borderWidth: 1,
                      borderRadius: 4,
                    }],
                  }}
                  options={{
                    ...CHART_OPTIONS,
                    scales: {
                      y: { beginAtZero: true, title: { display: true, text: chart.yLabel } },
                      x: { title: { display: true, text: chart.xLabel } },
                    },
                  }}
                />
              )}
              {chart.type === 'scatter' && (
                <Scatter
                  data={{
                    datasets: [{
                      label: `${chart.yLabel} vs ${chart.xLabel}`,
                      data: chart.data.map(d => ({ x: d.x, y: d.y })),
                      backgroundColor: 'rgba(16, 185, 129, 0.6)',
                      borderColor: 'rgb(16, 185, 129)',
                      pointRadius: 5,
                      pointHoverRadius: 7,
                    }],
                  }}
                  options={{
                    ...CHART_OPTIONS,
                    scales: {
                      x: { title: { display: true, text: chart.xLabel }, beginAtZero: true },
                      y: { title: { display: true, text: chart.yLabel }, beginAtZero: true },
                    },
                  }}
                />
              )}
            </div>
          </div>
        ))}

        {!chartData?.length && (
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