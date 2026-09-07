import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatChartValue,
  getChartAnimation,
  getChartOptions,
  getDoughnutOptions,
  getHorizontalBarOptions,
  getMultiSeriesColors,
  getScatterOptions,
} from './chartTheme.js';

test('chart palettes keep stable series slots across light and dark themes', () => {
  const light = getMultiSeriesColors(false);
  const dark = getMultiSeriesColors(true);

  assert.equal(light.length, 8);
  assert.equal(dark.length, 8);
  assert.notDeepEqual(light, dark);
  assert.equal(new Set(light.map((color) => color.solid)).size, light.length);
  assert.equal(new Set(dark.map((color) => color.solid)).size, dark.length);
});

test('chart values are localized and never expose non-finite numbers', () => {
  assert.equal(formatChartValue(1234.5, 'en-US'), '1,234.5');
  assert.equal(formatChartValue(1234.5, 'vi-VN'), '1.234,5');
  assert.equal(formatChartValue(Number.NaN, 'en-US'), '—');
  assert.equal(formatChartValue(Number.POSITIVE_INFINITY, 'en-US'), '—');
  assert.equal(formatChartValue(null, 'en-US'), '');
});

test('reduced motion disables chart animation', () => {
  assert.equal(getChartAnimation(true), false);
  assert.deepEqual(getChartAnimation(false), { duration: 500, easing: 'easeOutQuart' });
});

test('base chart options use restrained marks and locale-safe numeric ticks', () => {
  const options = getChartOptions(false);

  assert.equal(options.datasets.bar.maxBarThickness, 24);
  assert.equal(options.elements.line.borderWidth, 2);
  assert.equal(options.elements.point.hitRadius, 12);
  assert.equal(options.scales.y.ticks.callback(1234.5), '1,234.5');
  assert.equal(options.scales.x.grid.display, false);
});

test('doughnut and specialized axes remain usable on narrow screens', () => {
  const doughnut = getDoughnutOptions(false);
  const horizontal = getHorizontalBarOptions(false, 'Average score');
  const scatter = getScatterOptions(false, 'Study hours', 'Score');

  assert.equal(doughnut.plugins.legend.position, 'bottom');
  assert.equal(horizontal.scales.x.title.text, 'Average Score');
  assert.equal(horizontal.scales.y.ticks.callback, undefined);
  assert.equal(scatter.scales.x.ticks.callback(1000), '1,000');
  assert.equal(scatter.scales.y.ticks.callback(1000), '1,000');
});
