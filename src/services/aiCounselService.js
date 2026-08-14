/**
 * AI Counsel Service — Generates personalized intervention notes and advice.
 * Uses rule-based templates + ML predictions for immediate value.
 * Scaffolding for future LLM integration (Phase 3).
 */
const studentService = require('./studentService');

// Risk threshold constants
const RISK_THRESHOLDS = {
  attendance: 75,
  studyHours: 2,
  gpa: 2.5,
  sleepHours: 5.5,
};

/**
 * Generate intervention note for a student (used by Teacher/Admin).
 * Saves to student.notes column.
 * @param {number} studentId - Internal students.id
 * @param {string} [customPrompt] - Optional custom notes
 * @param {Object} [prediction] - Pre-fetched ML prediction (avoids duplicate call)
 */
async function generateInterventionNote(studentId, customPrompt, prediction) {
  const student = await studentService.findById(studentId);
  if (!student) {
    throw new Error('Student not found');
  }

  // Get ML prediction if not provided
  if (!prediction) {
    const mlService = require('./mlService');
    prediction = await mlService.predictForStudent(studentId);
  }

  // Assess risk factors
  const riskAssessment = assessRisk(student);

  // Build intervention note
  const interventionNote = buildInterventionNote(student, prediction, riskAssessment, customPrompt);

  // Save to student notes
  await studentService.updateStudent(studentId, { notes: interventionNote });

  return {
    studentId,
    student_id: student.student_id,
    interventionNote,
    prediction: {
      final_score: prediction.final_score,
      grade: prediction.grade,
      grade_confidence: prediction.grade_confidence,
      grade_probabilities: prediction.grade_probabilities,
    },
    riskAssessment,
  };
}

/**
 * Generate personalized advice for student portal (AI Academic Advisor).
 * Returns natural language recommendations.
 */
async function generateStudentAdvice(student, prediction) {
  const riskAssessment = assessRisk(student);
  const advice = [];

  // Academic performance advice
  if (prediction.grade === 'F' || prediction.grade === 'D') {
    advice.push({
      category: 'academic',
      priority: 'high',
      title: 'Urgent: Academic Intervention Needed',
      content: `Your predicted grade is ${prediction.grade}. Immediate action is required to improve your performance. Focus on increasing study hours and attending all classes.`,
      actionItems: [
        'Increase daily study time to at least 3 hours',
        'Attend 95%+ of remaining classes',
        'Schedule meeting with academic advisor',
        'Form study group with peers',
      ],
    });
  } else if (prediction.grade === 'C') {
    advice.push({
      category: 'academic',
      priority: 'medium',
      title: 'Room for Improvement',
      content: `You're on track for a ${prediction.grade} grade. With focused effort, you could reach B or A range.`,
      actionItems: [
        'Add 1-2 hours to daily study routine',
        'Review lecture notes within 24 hours',
        'Practice past exam questions weekly',
      ],
    });
  } else {
    advice.push({
      category: 'academic',
      priority: 'low',
      title: 'Strong Performance',
      content: `Excellent! You're predicted to achieve a ${prediction.grade} grade. Maintain your current habits.`,
      actionItems: [
        'Continue current study routine',
        'Consider mentoring peers',
        'Explore advanced topics',
      ],
    });
  }

  // Habit-based advice
  if (student.study_hours_per_day < 3) {
    advice.push({
      category: 'habits',
      priority: 'high',
      title: 'Low Study Hours',
      content: `You currently study ${student.study_hours_per_day} hours/day. Research shows 3-4 hours is optimal for grade improvement.`,
      actionItems: [
        'Schedule dedicated study blocks',
        'Use Pomodoro technique (25min focus / 5min break)',
        'Eliminate distractions during study time',
      ],
    });
  }

  if (student.sleep_hours < 7) {
    advice.push({
      category: 'habits',
      priority: 'high',
      title: 'Insufficient Sleep',
      content: `You're getting ${student.sleep_hours} hours of sleep. 7-9 hours is critical for memory consolidation and cognitive performance.`,
      actionItems: [
        'Set consistent bedtime/wake time',
        'Avoid screens 1 hour before bed',
        'Limit caffeine after 2 PM',
      ],
    });
  }

  if (student.attendance_percent < 80) {
    advice.push({
      category: 'habits',
      priority: 'critical',
      title: 'Attendance Risk',
      content: `Your attendance is ${student.attendance_percent}%. Below 75% may result in exam restrictions.`,
      actionItems: [
        'Attend all remaining classes',
        'Set calendar reminders for class times',
        'Communicate with instructors about any conflicts',
      ],
    });
  } else if (student.attendance_percent < 90) {
    advice.push({
      category: 'habits',
      priority: 'medium',
      title: 'Attendance Could Improve',
      content: `Good attendance at ${student.attendance_percent}%, but aim for 95%+ for optimal learning.`,
      actionItems: [
        'Target 100% attendance for next month',
        'Prepare questions before each class',
      ],
    });
  }

  // Part-time job balance
  if (student.part_time_job) {
    const workStudyBalance = student.study_hours_per_day / Math.max(1, (24 - student.sleep_hours - 8)); // assuming 8h work+commute
    if (workStudyBalance < 0.3) {
      advice.push({
        category: 'balance',
        priority: 'medium',
        title: 'Work-Study Balance',
        content: 'Balancing a part-time job with studies is challenging. Consider optimizing your schedule.',
        actionItems: [
          'Use commute time for audio review',
          'Schedule study sessions on non-work days',
          'Discuss reduced hours during exam periods with employer',
        ],
      });
    }
  }

  // GPA trend
  if (student.previous_gpa < 2.5) {
    advice.push({
      category: 'academic',
      priority: 'high',
      title: 'Low Previous GPA',
      content: `Your previous GPA of ${student.previous_gpa} indicates foundational gaps that need addressing.`,
      actionItems: [
        'Identify weak subject areas from past courses',
        'Seek tutoring or supplemental instruction',
        'Focus on core concepts before advanced topics',
      ],
    });
  }

  return {
    personality: determinePersonality(student, prediction),
    riskLevel: riskAssessment.riskLevel,
    totalAdviceCount: advice.length,
    advice: advice.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }),
  };
}

/**
 * Summarize student habits for notes (used by Admin).
 */
async function summarizeHabits(studentId) {
  const student = await studentService.findById(studentId);
  if (!student) {
    throw new Error('Student not found');
  }

  const elements = [];

  elements.push(`Student #${student.student_id} (${student.gender}, Age ${student.age})`);
  elements.push(`Academic: GPA ${student.previous_gpa}, Predicted Final: ${student.final_score || 'N/A'}`);
  elements.push(`Habits: Study ${student.study_hours_per_day}h/day, Sleep ${student.sleep_hours}h, Attendance ${student.attendance_percent}%`);
  elements.push(`Lifestyle: ${student.part_time_job ? 'Part-time job' : 'No job'}, ${student.extracurricular ? 'Extracurriculars' : 'No extracurriculars'}`);
  elements.push(`Environment: ${student.internet_access ? 'Internet access' : 'No internet'}, Parental education: ${student.parental_education}`);

  return {
    studentId,
    student_id: student.student_id,
    summary: elements.join(' | '),
  };
}

/**
 * Assess student risk factors.
 */
function assessRisk(student) {
  const factors = [];
  let riskScore = 0;

  if (student.attendance_percent !== null && student.attendance_percent < RISK_THRESHOLDS.attendance) {
    factors.push({
      field: 'attendance',
      label: 'Attendance',
      value: student.attendance_percent,
      threshold: RISK_THRESHOLDS.attendance,
      severity: student.attendance_percent < 60 ? 'critical' : 'high',
    });
    riskScore += (RISK_THRESHOLDS.attendance - student.attendance_percent);
  }

  if (student.study_hours_per_day !== null && student.study_hours_per_day < RISK_THRESHOLDS.studyHours) {
    factors.push({
      field: 'study_hours',
      label: 'Study Hours/Day',
      value: student.study_hours_per_day,
      threshold: RISK_THRESHOLDS.studyHours,
      severity: student.study_hours_per_day < 1 ? 'critical' : 'high',
    });
    riskScore += (RISK_THRESHOLDS.studyHours - student.study_hours_per_day) * 10;
  }

  if (student.previous_gpa !== null && student.previous_gpa < RISK_THRESHOLDS.gpa) {
    factors.push({
      field: 'gpa',
      label: 'Previous GPA',
      value: student.previous_gpa,
      threshold: RISK_THRESHOLDS.gpa,
      severity: student.previous_gpa < 2.0 ? 'critical' : 'high',
    });
    riskScore += (RISK_THRESHOLDS.gpa - student.previous_gpa) * 20;
  }

  if (student.sleep_hours !== null && student.sleep_hours < RISK_THRESHOLDS.sleepHours) {
    factors.push({
      field: 'sleep',
      label: 'Sleep Hours',
      value: student.sleep_hours,
      threshold: RISK_THRESHOLDS.sleepHours,
      severity: student.sleep_hours < 4 ? 'critical' : 'high',
    });
    riskScore += (RISK_THRESHOLDS.sleepHours - student.sleep_hours) * 15;
  }

  let riskLevel = 'low';
  if (riskScore >= 50) riskLevel = 'critical';
  else if (riskScore >= 30) riskLevel = 'high';
  else if (riskScore >= 15) riskLevel = 'medium';

  return {
    riskLevel,
    riskScore: Math.round(riskScore),
    factors,
    isAtRisk: riskLevel !== 'low',
  };
}

/**
 * Build intervention note for teacher/admin.
 */
function buildInterventionNote(student, prediction, riskAssessment, customPrompt) {
  const lines = [];

  lines.push(`=== AI INTERVENTION NOTE ===`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Student: #${student.student_id} (${student.name || 'N/A'})`);
  lines.push(``);

  lines.push(`--- PREDICTION ---`);
  lines.push(`Predicted Final Score: ${prediction.final_score}`);
  lines.push(`Predicted Grade: ${prediction.grade} (Confidence: ${prediction.grade_confidence}%)`);
  lines.push(`Grade Probabilities: ${Object.entries(prediction.grade_probabilities).map(([g, p]) => `${g}:${p}%`).join(', ')}`);
  lines.push(``);

  lines.push(`--- RISK ASSESSMENT ---`);
  lines.push(`Overall Risk: ${riskAssessment.riskLevel.toUpperCase()} (Score: ${riskAssessment.riskScore})`);
  if (riskAssessment.factors.length) {
    lines.push(`Risk Factors:`);
    for (const f of riskAssessment.factors) {
      lines.push(`  - ${f.label}: ${f.value} (Threshold: ${f.threshold}) [${f.severity}]`);
    }
  } else {
    lines.push(`No significant risk factors detected.`);
  }
  lines.push(``);

  lines.push(`--- RECOMMENDATIONS ---`);
  const recommendations = generateInterventionRecommendations(student, prediction, riskAssessment);
  for (const r of recommendations) {
    lines.push(`[${r.priority.toUpperCase()}] ${r.title}: ${r.content}`);
    if (r.actionItems) {
      for (const action of r.actionItems) {
        lines.push(`  * ${action}`);
      }
    }
  }

  if (customPrompt) {
    lines.push(``);
    lines.push(`--- CUSTOM NOTES ---`);
    lines.push(customPrompt);
  }

  lines.push(``);
  lines.push(`=== END OF NOTE ===`);

  return lines.join('\n');
}

/**
 * Generate intervention recommendations for teacher note.
 */
function generateInterventionRecommendations(student, prediction, riskAssessment) {
  const recs = [];

  // Immediate actions for critical risks
  for (const factor of riskAssessment.factors) {
    if (factor.severity === 'critical') {
      switch (factor.field) {
        case 'attendance':
          recs.push({
            priority: 'critical',
            title: 'Immediate Attendance Intervention',
            content: `Attendance at ${student.attendance_percent}% risks exam ban.`,
            actionItems: ['Daily attendance tracking', 'Parent/guardian notification', 'Academic probation review'],
          });
          break;
        case 'sleep':
          recs.push({
            priority: 'critical',
            title: 'Sleep Deprivation Intervention',
            content: `Only ${student.sleep_hours}h sleep severely impairs cognition.`,
            actionItems: ['Sleep hygiene counseling', 'Schedule adjustment', 'Health services referral if needed'],
          });
          break;
        case 'gpa':
          recs.push({
            priority: 'critical',
            title: 'Academic Probation Review',
            content: `GPA ${student.previous_gpa} indicates foundational deficits.`,
            actionItems: ['Mandatory tutoring', 'Course load reduction', 'Study skills workshop'],
          });
          break;
      }
    }
  }

  // Standard recommendations based on prediction
  if (prediction.grade === 'F' || prediction.grade === 'D') {
    recs.push({
      priority: 'high',
      title: 'Intensive Academic Support',
      content: `Predicted ${prediction.grade} requires immediate multi-faceted intervention.`,
      actionItems: [
        'Daily check-ins with mentor/tutor',
        'Structured study plan with milestones',
        'Weekly progress reviews',
        'Consider course withdrawal if past deadline',
      ],
    });
  }

  // Study habits
  if (student.study_hours_per_day < 2) {
    recs.push({
      priority: 'high',
      title: 'Study Habit Restructuring',
      content: `${student.study_hours_per_day}h/day is insufficient for academic success.`,
      actionItems: [
        'Minimum 2h/day structured study',
        'Active recall and spaced repetition techniques',
        'Weekly practice tests',
      ],
    });
  }

  // Balance for part-time workers
  if (student.part_time_job && student.study_hours_per_day < 3) {
    recs.push({
      priority: 'medium',
      title: 'Work-Study Balance Plan',
      content: 'Part-time employment requires strategic time management.',
      actionItems: [
        'Block study time in calendar (non-negotiable)',
        'Use active learning during shorter sessions',
        'Negotiate reduced hours during midterms/finals',
      ],
    });
  }

  // Positive reinforcement
  if (prediction.grade === 'A' || prediction.grade === 'B') {
    recs.push({
      priority: 'low',
      title: 'Maintain Excellence',
      content: 'Student is on track for high achievement.',
      actionItems: [
        'Continue effective strategies',
        'Consider peer tutoring role',
        'Explore leadership opportunities',
      ],
    });
  }

  return recs;
}

/**
 * Determine student personality type for personalized messaging.
 */
function determinePersonality(student, prediction) {
  if (student.study_hours_per_day >= 4 && student.attendance_percent >= 90) {
    return 'disciplined_achiever';
  }
  if (student.part_time_job && student.study_hours_per_day >= 3) {
    return 'hardworking_balancer';
  }
  if (student.sleep_hours < 6 && student.study_hours_per_day >= 3) {
    return 'overextended_striver';
  }
  if (student.attendance_percent < 75) {
    return 'disengaged_risk';
  }
  if (prediction.grade === 'A' || prediction.grade === 'B') {
    return 'natural_talent';
  }
  return 'developing_learner';
}

module.exports = {
  generateInterventionNote,
  generateStudentAdvice,
  summarizeHabits,
  assessRisk,
};