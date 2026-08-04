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

  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      setLoading(true);
      try {
        const data = await api.get('/dashboard/stats');
        if (mounted) {
          setKpis(data.chartData.kpis);
          setChartData(data.chartData.charts);
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="card-hover p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {formatKPI(kpi.value, kpi.format)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {chartData?.map((chart, idx) => (
          <div key={idx} className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{chart.title}</h3>
            <div className="chart-container">
              {chart.type === 'bar' && (
                <Bar
                  data={{
                    labels: chart.labels,
                    datasets: [{
                      label: chart.yLabel || 'Value',
                      data: chart.data,
                      backgroundColor: 'rgba(14, 165, 233, 0.7)',
                      borderColor: 'rgb(14, 165, 233)',
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
                      backgroundColor: 'rgba(34, 197, 94, 0.6)',
                      borderColor: 'rgb(34, 197, 94)',
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
          <div className="col-span-full text-center py-12 card">
            <p className="text-gray-500">No chart data available. Import a dataset with numeric columns to see visualizations.</p>
          </div>
        )}
      </div>
    </div>
  );
}