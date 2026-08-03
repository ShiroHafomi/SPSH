/**
 * Dashboard View — KPI cards + 3 Chart.js charts (bar, scatter, histogram).
 * Handles loading, empty, and error states.
 */
async function renderDashboard(container) {
  // ─── Loading State ──────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
      ${Array(4).fill(0).map(() => `
        <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-pulse" aria-hidden="true">
          <div class="h-4 bg-gray-200 rounded w-24 mb-3"></div>
          <div class="h-8 bg-gray-200 rounded w-16"></div>
        </div>
      `).join('')}
    </div>
    <div class="grid gap-6 lg:grid-cols-2">
      ${Array(3).fill(0).map(() => `
        <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-pulse" aria-hidden="true">
          <div class="h-5 bg-gray-200 rounded w-40 mb-4"></div>
          <div class="h-64 bg-gray-200 rounded"></div>
        </div>
      `).join('')}
    </div>
  `;

  try {
    // ─── Fetch Data ───────────────────────────────────────────────────────
    const data = await API.get('/dashboard/stats');
    const { chartData } = data;

    // ─── Render ───────────────────────────────────────────────────────────
    container.innerHTML = `
      <!-- KPI Cards -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        ${chartData.kpis.map(kpi => `
          <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-500">${escapeHtml(kpi.label)}</p>
                <p class="mt-2 text-3xl font-bold text-gray-900">
                  ${formatKPI(kpi.value, kpi.format)}
                </p>
              </div>
              <div class="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                </svg>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Charts -->
      <div class="grid gap-6 lg:grid-cols-2">
        ${chartData.charts.map((chart, idx) => `
          <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">${escapeHtml(chart.title)}</h3>
            <div class="relative" style="height: 320px;">
              <canvas id="chart-${idx}"></canvas>
            </div>
          </div>
        `).join('')}
      </div>

      ${!chartData.charts.length ? `
        <div class="col-span-full text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200">
          <p>No chart data available. Import a dataset with numeric columns to see visualizations.</p>
        </div>
      ` : ''}
    `;

    // ─── Initialize Charts ────────────────────────────────────────────────
    chartData.charts.forEach((cfg, idx) => {
      const canvas = document.getElementById(`chart-${idx}`);
      if (!canvas || !window.Chart) return;

      const ctx = canvas.getContext('2d');
      Chart.defaults.font.family = 'ui-sans-serif, system-ui, sans-serif';
      Chart.defaults.color = '#475569';

      if (cfg.type === 'bar') {
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: cfg.labels,
            datasets: [{
              label: cfg.yLabel || 'Value',
              data: cfg.data,
              backgroundColor: 'rgba(14, 165, 233, 0.7)',
              borderColor: 'rgb(14, 165, 233)',
              borderWidth: 1,
              borderRadius: 4,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { usePointStyle: true, padding: 16 } },
            },
            scales: {
              y: { beginAtZero: true, title: { display: true, text: cfg.yLabel } },
              x: { title: { display: true, text: cfg.xLabel } },
            },
          },
        });
      } else if (cfg.type === 'scatter') {
        new Chart(ctx, {
          type: 'scatter',
          data: {
            datasets: [{
              label: `${cfg.yLabel} vs ${cfg.xLabel}`,
              data: cfg.data.map(d => ({ x: d.x, y: d.y })),
              backgroundColor: 'rgba(34, 197, 94, 0.6)',
              borderColor: 'rgb(34, 197, 94)',
              pointRadius: 5,
              pointHoverRadius: 7,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { usePointStyle: true, padding: 16 } },
            },
            scales: {
              x: { title: { display: true, text: cfg.xLabel }, beginAtZero: true },
              y: { title: { display: true, text: cfg.yLabel }, beginAtZero: true },
            },
          },
        });
      }
    });

  } catch (err) {
    // ─── Error State ──────────────────────────────────────────────────────
    container.innerHTML = `
      <div class="flex min-h-[40vh] items-center justify-center">
        <div class="text-center">
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-danger-100 flex items-center justify-center">
            <svg class="w-8 h-8 text-danger-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01"/>
            </svg>
          </div>
          <p class="text-gray-900 font-medium mb-1">Failed to load dashboard</p>
          <p class="text-sm text-gray-500 mb-4">${escapeHtml(err.message)}</p>
          <button onclick="Router.navigate('#/dashboard')" class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium cursor-pointer">
            Retry
          </button>
        </div>
      </div>
    `;
  }
}

/**
 * Format a KPI value based on its configured format.
 */
function formatKPI(value, format) {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (isNaN(num)) return value;
  if (format === 'pct') return num.toFixed(1) + '%';
  if (format === 'dec1') return num.toFixed(1);
  return num.toLocaleString();
}