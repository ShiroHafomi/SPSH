'use strict';

const studentService = require('./studentService');
const mlService = require('./mlService');
const assignmentService = require('./assignmentService');
const studyGoalService = require('./studyGoalService');
const studySessionService = require('./studySessionService');
const predictionHistoryService = require('./predictionHistoryService');

const PRIORITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 });
const GRADE_ORDER = Object.freeze({ A: 1, B: 2, C: 3, D: 4, F: 5 });
const STATUS_LABELS = Object.freeze(['Excellent', 'On Track', 'Needs Attention', 'At Risk']);
const CARD_IDS = Object.freeze({
  'Stabilize your academic performance': 'performanceRecovery',
  'Build toward the next grade band': 'gradeImprovement',
  'Maintain your current momentum': 'maintainMomentum',
  'Improve attendance consistency': 'attendanceRecovery',
  'Keep attendance trending upward': 'attendanceProgress',
  'Increase focused study time': 'studyHoursRecovery',
  'Create a little more study capacity': 'studyHoursProgress',
  'Protect your sleep schedule': 'sleepRecovery',
  'Strengthen your sleep routine': 'sleepProgress',
  'Clear overdue assignments': 'overdueAssignments',
  'Stay ahead of upcoming deadlines': 'upcomingAssignments',
  'Reconnect with your active goal': 'goalAttention',
  'Keep your goal on track': 'goalProgress',
  'Make planned study sessions easier to keep': 'sessionConsistency',
  'Use your study-session routine': 'sessionMomentum',
  'Review the recent prediction trend': 'predictionTrend',
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function round(value, digits = 1) {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function mondayWindow(now = new Date()) {
  const current = new Date(now);
  const day = current.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() - daysSinceMonday
  ));
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function safeCard(card) {
  return {
    id: CARD_IDS[card.title] || 'studyPlanReview',
    title: text(card.title) || 'Study recommendation',
    explanation: text(card.explanation) || 'Review this part of your study plan.',
    priority: ['high', 'medium', 'low'].includes(card.priority) ? card.priority : 'low',
    ...(card.currentValue === undefined || card.currentValue === null ? {} : { currentValue: card.currentValue }),
    ...(card.suggestedValue === undefined || card.suggestedValue === null ? {} : { suggestedValue: card.suggestedValue }),
    nextStep: text(card.nextStep) || 'Review your plan and choose one small action for this week.',
    source: text(card.source) || 'profile',
  };
}

function addSignal(cards, card) {
  cards.push(safeCard(card));
}

function normalizeGoals(goals) {
  return Array.isArray(goals)
    ? goals.filter((entry) => entry?.goal?.status === 'active')
    : [];
}

function gradeRisk(grade) {
  return GRADE_ORDER[grade] || null;
}

function buildRecommendations(input = {}) {
  const student = input.student && typeof input.student === 'object' ? input.student : {};
  const prediction = input.prediction && typeof input.prediction === 'object' ? input.prediction : {};
  const assignments = input.assignments && typeof input.assignments === 'object' ? input.assignments : {};
  const sessionSummary = input.sessionSummary && typeof input.sessionSummary === 'object'
    ? input.sessionSummary
    : {};
  const goals = normalizeGoals(input.goals);
  const history = Array.isArray(input.history) ? input.history : [];
  const cards = [];
  let highSignals = 0;
  let attentionSignals = 0;

  const score = finite(prediction.final_score);
  const grade = text(prediction.grade)?.toUpperCase();
  const studyHours = finite(student.study_hours_per_day);
  const attendance = finite(student.attendance_percent);
  const sleepHours = finite(student.sleep_hours);
  const overdue = finite(assignments.summary?.overdue);
  const todoAssignments = finite(assignments.summary?.todo);
  const inProgressAssignments = finite(assignments.summary?.inProgress);
  const openAssignments = (todoAssignments || 0) + (inProgressAssignments || 0) > 0;
  const skipped = finite(sessionSummary.skipped_sessions);
  const totalSessions = finite(sessionSummary.total_sessions);

  if ((grade && gradeRisk(grade) >= GRADE_ORDER.D) || (score !== null && score < 60)) {
    highSignals += 1;
    addSignal(cards, {
      title: 'Stabilize your academic performance',
      explanation: 'Your current prediction indicates that a focused recovery plan could improve your result.',
      priority: 'high',
      currentValue: grade ? `Grade ${grade}` : `${round(score)} / 100`,
      suggestedValue: 'A consistent weekly study plan',
      nextStep: 'Choose one priority subject and schedule a focused session before your next deadline.',
      source: 'prediction',
    });
  } else if (grade && gradeRisk(grade) === GRADE_ORDER.C) {
    attentionSignals += 1;
    addSignal(cards, {
      title: 'Build toward the next grade band',
      explanation: 'Your prediction is close enough to improve with consistent practice and timely assignment work.',
      priority: 'medium',
      currentValue: `Grade ${grade}`,
      suggestedValue: 'One grade band higher',
      nextStep: 'Review missed work and complete one targeted practice block this week.',
      source: 'prediction',
    });
  } else if (score !== null || grade) {
    addSignal(cards, {
      title: 'Maintain your current momentum',
      explanation: 'Your current prediction is a strength to protect while you continue working toward your goals.',
      priority: 'low',
      currentValue: grade ? `Grade ${grade}` : `${round(score)} / 100`,
      suggestedValue: 'Keep your current routine',
      nextStep: 'Keep your planned study sessions consistent and review progress weekly.',
      source: 'prediction',
    });
  }

  if (attendance !== null && attendance < 75) {
    highSignals += 1;
    addSignal(cards, {
      title: 'Improve attendance consistency',
      explanation: 'Attendance below the personal risk threshold can make it harder to keep up with new material.',
      priority: 'high',
      currentValue: `${round(attendance)}%`,
      suggestedValue: 'At least 85%',
      nextStep: 'Identify your next missed class risk and arrange a reminder or make-up plan.',
      source: 'profile',
    });
  } else if (attendance !== null && attendance < 85) {
    attentionSignals += 1;
    addSignal(cards, {
      title: 'Keep attendance trending upward',
      explanation: 'A stronger attendance buffer gives you more opportunities to learn material in class.',
      priority: 'medium',
      currentValue: `${round(attendance)}%`,
      suggestedValue: 'At least 85%',
      nextStep: 'Plan ahead for the next class or appointment that could interrupt attendance.',
      source: 'profile',
    });
  }

  if (studyHours !== null && studyHours < 2) {
    highSignals += 1;
    addSignal(cards, {
      title: 'Increase focused study time',
      explanation: 'Your current daily study time is below the level used by the academic risk checks.',
      priority: 'high',
      currentValue: `${round(studyHours)} hours/day`,
      suggestedValue: 'At least 2 hours/day',
      nextStep: 'Schedule one uninterrupted 25-minute study block today, then add another when it feels manageable.',
      source: 'profile',
    });
  } else if (studyHours !== null && studyHours < 3) {
    attentionSignals += 1;
    addSignal(cards, {
      title: 'Create a little more study capacity',
      explanation: 'A modest increase in focused study time can help you make steady progress toward your goals.',
      priority: 'medium',
      currentValue: `${round(studyHours)} hours/day`,
      suggestedValue: 'At least 3 hours/day',
      nextStep: 'Add one short focused block to two days in your weekly plan.',
      source: 'profile',
    });
  }

  if (sleepHours !== null && sleepHours < 5.5) {
    highSignals += 1;
    addSignal(cards, {
      title: 'Protect your sleep schedule',
      explanation: 'Very low sleep can make concentration and memory work harder during study and class time.',
      priority: 'high',
      currentValue: `${round(sleepHours)} hours/night`,
      suggestedValue: 'At least 7 hours/night',
      nextStep: 'Set a consistent wind-down time tonight and protect it from study or screen interruptions.',
      source: 'profile',
    });
  } else if (sleepHours !== null && sleepHours < 7) {
    attentionSignals += 1;
    addSignal(cards, {
      title: 'Strengthen your sleep routine',
      explanation: 'More consistent sleep can support attention and recovery between study sessions.',
      priority: 'medium',
      currentValue: `${round(sleepHours)} hours/night`,
      suggestedValue: '7–9 hours/night',
      nextStep: 'Move your bedtime earlier by 15 minutes on the next few nights.',
      source: 'profile',
    });
  }

  if (overdue !== null && overdue > 0) {
    highSignals += 1;
    addSignal(cards, {
      title: 'Clear overdue assignments',
      explanation: 'Overdue work is an immediate opportunity to reduce academic pressure and protect your score.',
      priority: 'high',
      currentValue: `${overdue} overdue assignment${overdue === 1 ? '' : 's'}`,
      suggestedValue: '0 overdue assignments',
      nextStep: 'Open Assignments and choose the overdue item with the nearest or highest-impact deadline.',
      source: 'assignments',
    });
  } else if (openAssignments) {
    addSignal(cards, {
      title: 'Stay ahead of upcoming deadlines',
      explanation: 'Your open assignments provide a clear way to turn study time into completed work.',
      priority: 'low',
      currentValue: `${(finite(assignments.summary?.todo) || 0) + (finite(assignments.summary?.inProgress) || 0)} open assignments`,
      suggestedValue: 'Keep every deadline scheduled',
      nextStep: 'Review your next deadline and reserve a study block before it is due.',
      source: 'assignments',
    });
  }

  const activeGoal = goals[0];
  const goalProgress = finite(activeGoal?.progress?.progressPercentage);
  const goalStatus = text(activeGoal?.progress?.status);
  if (activeGoal && ['needs_attention', 'overdue'].includes(goalStatus)) {
    attentionSignals += 1;
    addSignal(cards, {
      title: 'Reconnect with your active goal',
      explanation: 'Your goal progress shows that the current plan may need a smaller or more immediate milestone.',
      priority: goalStatus === 'overdue' ? 'high' : 'medium',
      currentValue: goalProgress === null ? goalStatus : `${round(goalProgress)}% complete`,
      suggestedValue: 'A next check-in this week',
      nextStep: 'Open Goals and record a check-in with one measurable action for the next seven days.',
      source: 'goals',
    });
  } else if (activeGoal && goalProgress !== null && goalProgress >= 75) {
    addSignal(cards, {
      title: 'Keep your goal on track',
      explanation: 'Your active goal is progressing well; regular check-ins can help you finish it reliably.',
      priority: 'low',
      currentValue: `${round(goalProgress)}% complete`,
      suggestedValue: 'Complete the next check-in',
      nextStep: 'Review the goal deadline and keep your next check-in on the calendar.',
      source: 'goals',
    });
  }

  if (totalSessions !== null && totalSessions > 0 && skipped !== null && skipped / totalSessions >= 0.3) {
    attentionSignals += 1;
    addSignal(cards, {
      title: 'Make planned study sessions easier to keep',
      explanation: 'Several planned sessions were skipped this week, so a smaller or better-timed plan may be more sustainable.',
      priority: 'medium',
      currentValue: `${skipped} of ${totalSessions} sessions skipped`,
      suggestedValue: 'Complete at least 70% of planned sessions',
      nextStep: 'Open Study Sessions and shorten or reschedule the next session to a time you can protect.',
      source: 'study_sessions',
    });
  } else if (totalSessions !== null && totalSessions > 0 && sessionSummary.completed_sessions > 0) {
    addSignal(cards, {
      title: 'Use your study-session routine',
      explanation: 'Completed sessions show that scheduled focus time is already part of your routine.',
      priority: 'low',
      currentValue: `${sessionSummary.completed_sessions} completed session${sessionSummary.completed_sessions === 1 ? '' : 's'}`,
      suggestedValue: 'Keep the next session scheduled',
      nextStep: 'Repeat the time slot that worked best for your next focused session.',
      source: 'study_sessions',
    });
  }

  if (history.length >= 2) {
    const newest = finite(history[0]?.predictedScore);
    const oldest = finite(history[history.length - 1]?.predictedScore);
    if (newest !== null && oldest !== null && newest - oldest <= -5) {
      attentionSignals += 1;
      addSignal(cards, {
        title: 'Review the recent prediction trend',
        explanation: 'Recent prediction history has moved downward, which is a signal to review what changed in your routine.',
        priority: 'medium',
        currentValue: `${round(newest)} vs ${round(oldest)} previously`,
        suggestedValue: 'Return to your stronger baseline habits',
        nextStep: 'Compare your latest weekly check-in with the earlier one and choose one habit to restore.',
        source: 'prediction_history',
      });
    }
  }

  cards.sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]);
  const recommendations = cards.slice(0, 5);
  const hasEvidence = score !== null || Boolean(grade) || studyHours !== null || attendance !== null
    || sleepHours !== null || overdue !== null || totalSessions !== null || goals.length > 0;
  const status = !hasEvidence
    ? 'Needs Attention'
    : highSignals >= 2
      ? 'At Risk'
      : highSignals === 1 || attentionSignals >= 2
        ? 'Needs Attention'
        : (grade === 'A' || (score !== null && score >= 85)) && attentionSignals === 0
          ? 'Excellent'
          : 'On Track';

  return {
    overallStatus: STATUS_LABELS.includes(status) ? status : 'On Track',
    recommendations,
    summary: {
      predictedScore: round(score),
      predictedGrade: grade && GRADE_ORDER[grade] ? grade : null,
      studyHoursPerDay: round(studyHours),
      attendancePercent: round(attendance),
      sleepHours: round(sleepHours),
      activeGoalCount: goals.length,
      overdueAssignments: overdue,
    },
    dataAvailability: {
      prediction: score !== null || Boolean(grade),
      profile: studyHours !== null || attendance !== null || sleepHours !== null,
      goals: goals.length > 0,
      assignments: openAssignments || overdue !== null,
      studySessions: totalSessions !== null,
      predictionHistory: history.length > 0,
    },
  };
}

async function optional(load, fallback) {
  try {
    return await load();
  } catch (error) {
    return fallback;
  }
}

async function getRecommendations({ studentId, userId, now = new Date() }) {
  const student = await studentService.findById(studentId);
  if (!student) return null;
  const prediction = await mlService.predictForStudent(studentId);
  const window = mondayWindow(now);

  const [goals, assignments, sessionSummary, history] = await Promise.all([
    optional(() => studyGoalService.getGoalsWithProgressByStudent(studentId, { now }), []),
    optional(() => assignmentService.listAssignmentsForStudent(
      { studentId, userId },
      { page: 1, size: 25, sort: 'due_asc' },
      { now }
    ), {}),
    optional(() => studySessionService.getWeeklyStudySessionSummary(studentId, window), {}),
    optional(() => predictionHistoryService.listPredictionHistoryForStudent(studentId, { size: 10 }), []),
  ]);

  return buildRecommendations({ student, prediction, goals, assignments, sessionSummary, history });
}

module.exports = {
  STATUS_LABELS,
  buildRecommendations,
  getRecommendations,
  mondayWindow,
};
