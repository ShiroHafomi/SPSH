/**
 * Schema-agnostic chart configuration.
 * Reads schema_map.json and picks columns for dashboard charts via semantic heuristics.
 * Falls back to "first numeric column" if no semantic match — so any CSV renders something.
 */
const { getSchemaMap, getSemantic, getNumericColumns, getCategoryColumns, getDisplayColumns } = require('./schemaMap');

/**
 * Format label: replace underscores with spaces, Title Case
 */
function formatLabel(label) {
  if (!label) return '';
  return label
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

let _chartConfig = null;

/**
 * Build the chart configuration object used by dashboard views.
 * Returns a plain object safe to JSON.stringify into the browser.
 */
function buildChartConfig() {
  const schema = getSchemaMap();
  if (!schema) return { error: 'No schema_map.json loaded' };

  const numeric = getNumericColumns().filter(c => c.name !== 'student_id');
  const categorical = getCategoryColumns();
  const displayCols = getDisplayColumns();

  // Semantic picks (first match per semantic)
  const studyHours = getSemantic('studyHours');
  const score = getSemantic('score');
  const attendance = getSemantic('attendance');
  const sleep = getSemantic('sleep');
  const age = getSemantic('age');
  const gender = getSemantic('gender');

  // Fallback helpers
  const firstNumeric = numeric[0];
  const secondNumeric = numeric[1];
  const firstCategorical = categorical[0];

  // --- KPI Config ---
  // Each KPI: { label, columnName, agg, format }
  const kpis = [];
  // Total students (always available)
  kpis.push({ label: 'Total Students', key: 'total', format: 'int' });

  if (score) {
    kpis.push({ label: 'Avg Score', column: score.name, agg: 'avg', format: 'pct' });
  }
  if (studyHours) {
    kpis.push({ label: 'Avg Study Hrs/Day', column: studyHours.name, agg: 'avg', format: 'dec1' });
  }
  if (attendance) {
    kpis.push({ label: 'Avg Attendance %', column: attendance.name, agg: 'avg', format: 'pct' });
  }
  if (sleep) {
    kpis.push({ label: 'Avg Sleep Hrs', column: sleep.name, agg: 'avg', format: 'dec1' });
  }
  // Fallback KPIs if none of the above matched
  if (kpis.length === 1) {
    // Only total students — add first 2 numeric columns as generic KPIs
    numeric.slice(0, 2).forEach(c => {
      kpis.push({ label: `Avg ${formatLabel(c.displayLabel)}`, column: c.name, agg: 'avg', format: 'dec1' });
    });
  }

  // --- Bar Chart: Avg(score) grouped by gender (or first categorical) ---
  let barChart = null;
  if (score && gender) {
    barChart = {
      type: 'bar',
      title: `Average ${formatLabel(score.displayLabel)} by ${formatLabel(gender.displayLabel)}`,
      xColumn: gender.name,
      yColumn: score.name,
      agg: 'avg',
      groupBy: gender.name,
    };
  } else if (score && firstCategorical) {
    barChart = {
      type: 'bar',
      title: `Average ${formatLabel(score.displayLabel)} by ${formatLabel(firstCategorical.displayLabel)}`,
      xColumn: firstCategorical.name,
      yColumn: score.name,
      agg: 'avg',
      groupBy: firstCategorical.name,
    };
  } else if (numeric.length >= 2) {
    // Two numeric columns: first categorical-ish becomes X, second numeric becomes Y
    barChart = {
      type: 'bar',
      title: `${formatLabel(displayCols[1]?.displayLabel || 'Value')} by ${formatLabel(displayCols[0]?.displayLabel || 'Category')}`,
      xColumn: displayCols[0]?.name,
      yColumn: displayCols[1]?.name,
      agg: 'avg',
      groupBy: displayCols[0]?.name,
    };
  }

  // --- Scatter: study_hours vs score ---
  let scatterChart = null;
  if (studyHours && score) {
    scatterChart = {
      type: 'scatter',
      title: `${formatLabel(studyHours.displayLabel)} vs ${formatLabel(score.displayLabel)}`,
      xColumn: studyHours.name,
      yColumn: score.name,
      xLabel: formatLabel(studyHours.displayLabel),
      yLabel: formatLabel(score.displayLabel),
    };
  } else if (numeric.length >= 2) {
    scatterChart = {
      type: 'scatter',
      title: `${formatLabel(firstNumeric.displayLabel)} vs ${formatLabel(secondNumeric.displayLabel)}`,
      xColumn: firstNumeric.name,
      yColumn: secondNumeric.name,
      xLabel: formatLabel(firstNumeric.displayLabel),
      yLabel: formatLabel(secondNumeric.displayLabel),
    };
  }

  // --- Histogram: distribution of score (or first numeric) ---
  let histogramChart = null;
  const histTarget = score || firstNumeric;
  if (histTarget) {
    histogramChart = {
      type: 'histogram',
      title: `Distribution of ${formatLabel(histTarget.displayLabel)}`,
      column: histTarget.name,
      label: histTarget.displayLabel,
      bins: 10,
    };
  }

  // Compile final config
  _chartConfig = {
    kpis,
    charts: [barChart, scatterChart, histogramChart].filter(Boolean),
    meta: {
      numericColumns: numeric.map(c => ({ name: c.name, label: formatLabel(c.displayLabel), role: c.semantic })),
      categoryColumns: categorical.map(c => ({ name: c.name, label: formatLabel(c.displayLabel), role: c.semantic })),
    },
  };

  return _chartConfig;
}

function getChartConfig() {
  if (!_chartConfig) buildChartConfig();
  return _chartConfig;
}

// Rebuild when schema changes (e.g., after re-import)
function rebuildChartConfig() {
  _chartConfig = null;
  return buildChartConfig();
}

module.exports = {
  buildChartConfig,
  getChartConfig,
  rebuildChartConfig,
};