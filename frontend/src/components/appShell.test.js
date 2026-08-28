import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDrawerStateAfterAction,
  getNavigationForRole,
  getPageContext,
  isNavigationItemActive,
} from './appShell.js';

describe('role navigation', () => {
  it('keeps privileged destinations out of student navigation', () => {
    const paths = getNavigationForRole('student').flatMap((group) => group.items.map((item) => item.to));
    assert.ok(paths.includes('/student/assignments'));
    assert.ok(paths.includes('/predictor'));
    assert.equal(paths.some((path) => path.startsWith('/admin') || path.startsWith('/teacher')), false);
  });

  it('exposes the correct role-specific management destinations', () => {
    const adminPaths = getNavigationForRole('admin').flatMap((group) => group.items.map((item) => item.to));
    const teacherPaths = getNavigationForRole('teacher').flatMap((group) => group.items.map((item) => item.to));
    assert.ok(adminPaths.includes('/admin/users'));
    assert.ok(teacherPaths.includes('/teacher/students'));
    assert.equal(teacherPaths.includes('/admin/users'), false);
  });

  it('returns no destinations for an unknown role', () => {
    assert.deepEqual(getNavigationForRole('unknown'), []);
  });
});

describe('active route and page context', () => {
  it('requires exact matches for shared destinations', () => {
    const item = { to: '/dashboard', exact: true };
    assert.equal(isNavigationItemActive('/dashboard', item), true);
    assert.equal(isNavigationItemActive('/dashboard/details', item), false);
  });

  it('matches nested role routes by prefix without matching sibling names', () => {
    const item = { to: '/teacher/students' };
    assert.equal(isNavigationItemActive('/teacher/students/12/edit', item), true);
    assert.equal(isNavigationItemActive('/teacher/students-archive', item), false);
  });

  it('uses the most specific matching item for the page title', () => {
    const context = getPageContext('admin', '/admin/students/17/goals');
    assert.equal(context?.to, '/admin/students');
    assert.equal(context?.labelKey, 'admin.studentManagement');
  });
});

describe('mobile drawer state', () => {
  it('supports open, toggle, and every close action', () => {
    assert.equal(getDrawerStateAfterAction(false, 'open'), true);
    assert.equal(getDrawerStateAfterAction(false, 'toggle'), true);
    assert.equal(getDrawerStateAfterAction(true, 'toggle'), false);
    for (const action of ['close', 'navigate', 'escape']) {
      assert.equal(getDrawerStateAfterAction(true, action), false);
    }
  });

  it('preserves state for an unknown action', () => {
    assert.equal(getDrawerStateAfterAction(true, 'unknown'), true);
    assert.equal(getDrawerStateAfterAction(false, 'unknown'), false);
  });
});
