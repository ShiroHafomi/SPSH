/**
 * Shared label formatting utility.
 * Converts snake_case, camelCase, and PascalCase to Title Case with spaces.
 * Removes underscores and adds proper spacing.
 */
export function formatLabel(label) {
  if (!label) return '';
  return label
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Format a column name for display (used in table headers, chart labels, etc.)
 * Handles both schema displayLabels and raw column names.
 */
export function formatColumnLabel(displayLabel, fallbackName) {
  const source = displayLabel || fallbackName || '';
  return formatLabel(source);
}

/**
 * Format chart axis labels and titles consistently.
 */
export function formatChartLabel(label) {
  return formatLabel(label);
}