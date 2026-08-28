import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import en from './en.js';
import vi from './vi.js';

function flatten(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, key) => {
    const pre = prefix.length ? `${prefix}.` : '';
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      return [...acc, ...flatten(obj[key], pre + key)];
    }
    return [...acc, pre + key];
  }, []);
}

describe('StudyPlanner locale parity', () => {
  it('has matching keys in en and vi for the studyPlanner namespace', () => {
    const enKeys = flatten(en.studyPlanner).sort();
    const viKeys = flatten(vi.studyPlanner).sort();

    assert.deepStrictEqual(enKeys, viKeys);
  });

  it('has matching nav.studyPlanner keys', () => {
    assert.strictEqual(typeof en.nav.studyPlanner, 'string');
    assert.strictEqual(typeof vi.nav.studyPlanner, 'string');
    assert.ok(en.nav.studyPlanner.length > 0);
    assert.ok(vi.nav.studyPlanner.length > 0);
  });
});
