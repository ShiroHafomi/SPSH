/**
 * Dashboard Controller — handles the home page with KPIs and charts.
 */
const { getDashboardStats } = require('../services/studentService');
const { getChartConfig } = require('../utils/chartConfig');
const { loadSchemaMap } = require('../utils/schemaMap');

async function dashboard(req, res) {
  const dbReady = req.app.locals.dbReady;

  if (!dbReady) {
    // Render error page with import instructions
    return res.render('error', {
      title: 'Data Not Imported',
      message: 'No student data found in the database.',
      details: 'Run the import command to load the dataset:',
      commands: [
        'npm run import:sample     # Uses bundled sample CSV',
        'npm run import -- --file <your-kaggle.csv> --replace  # Your real CSV'
      ],
      backLink: '/',
      flash: {},
    });
  }

  // Ensure schema_map is loaded (in case of re-import)
  loadSchemaMap();

  // Fetch aggregated stats
  const stats = await getDashboardStats();
  const chartConfig = getChartConfig();

  // Build chart data for EJS rendering + client-side JSON
  const chartData = {
    kpis: chartConfig.kpis.map(k => ({
      label: k.label,
      key: k.key || k.column,
      value: stats[k.key || k.column] ?? stats.totalStudents,
      format: k.format,
    })),
    charts: chartConfig.charts.map(c => {
      if (c.type === 'bar') {
        return {
          type: 'bar',
          title: c.title,
          labels: stats.barChart?.map(d => d.label) || [],
          data: stats.barChart?.map(d => d.value) || [],
          xLabel: c.xColumn,
          yLabel: c.yColumn,
        };
      }
      if (c.type === 'scatter') {
        return {
          type: 'scatter',
          title: c.title,
          data: stats.scatterChart || [],
          xLabel: c.xLabel,
          yLabel: c.yLabel,
        };
      }
      if (c.type === 'histogram') {
        return {
          type: 'bar', // Chart.js uses bar for histograms
          title: c.title,
          labels: stats.histogramChart?.map(d => d.label) || [],
          data: stats.histogramChart?.map(d => d.count) || [],
          xLabel: c.label,
          yLabel: 'Count',
        };
      }
      return null;
    }).filter(Boolean),
  };

  res.render('dashboard', {
    title: 'Dashboard',
    stats,
    // Pass raw object for EJS rendering, JSON string for client-side JS
    chartData,
    chartDataJSON: JSON.stringify(chartData),
    chartConfigJSON: JSON.stringify(chartConfig.meta),
  });
}

module.exports = { dashboard };