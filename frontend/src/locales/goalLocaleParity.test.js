import test from 'node:test';
import assert from 'node:assert/strict';
import en from './en.js';
import vi from './vi.js';

function leafPaths(value, prefix = '') {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return entry && typeof entry === 'object'
      ? leafPaths(entry, path)
      : [path];
  }).sort();
}

test('English and Vietnamese goal feature translations have matching keys', () => {
  ['goals', 'checkins', 'progress'].forEach((namespace) => {
    assert.deepEqual(leafPaths(en[namespace]), leafPaths(vi[namespace]), namespace);
  });
});
