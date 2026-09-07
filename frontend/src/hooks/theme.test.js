import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveInitialTheme } from './theme.js';

describe('initial theme resolution', () => {
  it('honors an explicit saved choice over system preference', () => {
    assert.equal(resolveInitialTheme('light', true), 'light');
    assert.equal(resolveInitialTheme('dark', false), 'dark');
  });

  it('uses system preference when no valid choice is saved', () => {
    assert.equal(resolveInitialTheme(null, true), 'dark');
    assert.equal(resolveInitialTheme(undefined, false), 'light');
    assert.equal(resolveInitialTheme('unsupported', true), 'dark');
  });
});
