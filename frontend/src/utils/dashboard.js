import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createDashboardResource } from './dashboardResource';
import {
  computeAssignmentTimeState,
  formatAssignmentDeadline,
  normalizeAssignmentListResponse,
} from './assignments';
import { normalizeGoalEntries } from './goalProgress';

/**
 * Wire a createDashboardResource instance into a React component.
 *
 * The resource is created lazily and kept across renders; `load` is read through
 * a ref so the caller never passes a stale closure. `resume`/`dispose` handle
 * StrictMode's mount/cleanup replay and unmount, so the underlying transport is
 * only issued once per lifecycle while still being cancelled on unmount.
 */
export function useDashboardResource(load) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const resourceRef = useRef(null);
  if (resourceRef.current === null) {
    resourceRef.current = createDashboardResource((signal) => loadRef.current(signal));
  }
  const resource = resourceRef.current;

  useEffect(() => {
    resource.resume();
    return () => resource.dispose();
  }, [resource]);

  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot
  );

  return { ...state, refresh: resource.refresh };
}

/**
 * Bounded, server-aggregated assignment summary for a student's own list.
 * The backend already computes `summary` across the full (unfiltered) query
 * scope, so this is a real count rather than a current-page estimate.
 */
export function normalizeAssignmentOverview(response) {
  const normalized = normalizeAssignmentListResponse(response, 1, 8);
  return {
    summary: normalized.summary,
    assignments: normalized.assignments,
  };
}

/**
 * Open (unfinished) assignments, sorted by due date with overdue items first.
 * Only assignments with a parseable due date are ordered; malformed rows fall
 * to the end rather than producing NaN comparisons.
 */
export function deriveOpenAssignments(assignments) {
  return (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => assignment?.status !== 'done')
    .map((assignment) => ({ ...assignment, ...computeAssignmentTimeState(assignment) }))
    .sort((left, right) => {
      const leftDue = new Date(left?.due_at).getTime();
      const rightDue = new Date(right?.due_at).getTime();
      return (Number.isFinite(leftDue) ? leftDue : Number.POSITIVE_INFINITY)
        - (Number.isFinite(rightDue) ? rightDue : Number.POSITIVE_INFINITY);
    });
}

/** Localized absolute deadline for an assignment, or an em dash when invalid. */
export function formatAssignmentDue(value, timeZone, locale = 'en-US') {
  return formatAssignmentDeadline(value, timeZone, locale) || '—';
}

/** Journal list previews, reduced to the fields the dashboard actually renders. */
export function normalizeJournalPreviews(response) {
  if (!Array.isArray(response?.entries)) return [];
  return response.entries.map((entry) => ({
    id: entry?.id,
    title: typeof entry?.title === 'string' ? entry.title : '',
    entry_date: typeof entry?.entry_date === 'string' ? entry.entry_date : '',
    understanding_rating: entry?.understanding_rating ?? null,
    learned_preview: typeof entry?.learned_preview === 'string' ? entry.learned_preview : '',
  }));
}

/** Active (student-visible) support plans from a list response. */
export function deriveActiveSupportPlans(response) {
  if (!Array.isArray(response?.plans)) return [];
  return response.plans.filter((plan) => plan?.status === 'active');
}

/** Active goals from a goals-with-progress response. */
export function deriveActiveGoals(entries) {
  return normalizeGoalEntries(entries).filter((entry) => entry?.goal?.status === 'active');
}