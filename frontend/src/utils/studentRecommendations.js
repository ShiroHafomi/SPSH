const STATUS_VALUES = new Set(['Excellent', 'On Track', 'Needs Attention', 'At Risk']);
const PRIORITY_VALUES = new Set(['high', 'medium', 'low']);

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.trim() || null;
  return value === null || value === undefined ? null : safeText(value) || null;
}

export function normalizeStudentRecommendations(response) {
  const data = record(response);
  const summary = record(data.summary);
  const availability = record(data.dataAvailability);
  const recommendations = Array.isArray(data.recommendations)
    ? data.recommendations.flatMap((value) => {
      const item = record(value);
      const title = safeText(item.title);
      const explanation = safeText(item.explanation);
      const nextStep = safeText(item.nextStep);
      if (!title || !explanation || !nextStep || !PRIORITY_VALUES.has(item.priority)) return [];
      return [{
        id: safeText(item.id) || 'studyPlanReview',
        title,
        explanation,
        priority: item.priority,
        currentValue: safeValue(item.currentValue),
        suggestedValue: safeValue(item.suggestedValue),
        nextStep,
      }];
    }).slice(0, 5)
    : [];

  return {
    overallStatus: STATUS_VALUES.has(data.overallStatus) ? data.overallStatus : null,
    recommendations,
    summary: {
      predictedScore: safeValue(summary.predictedScore),
      predictedGrade: safeText(summary.predictedGrade) || null,
      studyHoursPerDay: safeValue(summary.studyHoursPerDay),
      attendancePercent: safeValue(summary.attendancePercent),
      sleepHours: safeValue(summary.sleepHours),
      activeGoalCount: safeValue(summary.activeGoalCount),
      overdueAssignments: safeValue(summary.overdueAssignments),
    },
    dataAvailability: Object.fromEntries(
      ['prediction', 'profile', 'goals', 'assignments', 'studySessions', 'predictionHistory']
        .map((key) => [key, availability[key] === true])
    ),
  };
}

export function getStudentRecommendationsViewState({ loading, error, data }) {
  if (loading) return 'loading';
  if (error) return 'error';
  if (!data || !data.recommendations.length) return 'empty';
  return 'ready';
}
