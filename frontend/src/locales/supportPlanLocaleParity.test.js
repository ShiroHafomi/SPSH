import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import en from './en.js';
import vi from './vi.js';
import { PLAN_STATUSES, TASK_STATUSES } from '../utils/supportPlans.js';

function leaves(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? leaves(child, path) : [path];
  }).sort();
}
const lookup = (locale, key) => key.split('.').reduce((value, part) => value?.[part], locale);

test('support English and Vietnamese keys and interpolation parameters stay synchronized', () => {
  for (const section of ['supportPlans', 'notifications']) {
    assert.deepEqual(leaves(en[section]), leaves(vi[section]));
    for (const key of leaves(en[section])) {
      const english = lookup(en[section], key), vietnamese = lookup(vi[section], key);
      assert.equal(typeof english, 'string'); assert.ok(vietnamese.trim());
      assert.deepEqual(english.match(/\{\w+\}/g), vietnamese.match(/\{\w+\}/g), key);
      assert.doesNotMatch(vietnamese, /�/);
    }
  }
  for (const locale of [en, vi]) {
    for (const status of PLAN_STATUSES) assert.ok(locale.supportPlans.status[status]);
    for (const status of TASK_STATUSES) assert.ok(locale.supportPlans.taskStatuses[status]);
    for (const action of ['activate', 'complete', 'cancel']) assert.ok(locale.supportPlans.confirm[action]);
    assert.ok(locale.notifications.supportPlanActivated.title);
    assert.ok(locale.notifications.supportPlanActivated.message);
  }
});

test('all literal support-plan UI and utility translation keys exist in both languages', () => {
  for (const file of ['../pages/SupportPlans.jsx', '../utils/supportPlans.js', '../pages/AdminAITools.jsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/['"](supportPlans\.[\w.]+)['"]/g)) {
      for (const locale of [en, vi]) assert.equal(typeof lookup(locale, match[1]), 'string', match[1]);
    }
  }
});
