/**
 * Rule-based feedback templates for student performance recommendations.
 * Generates personalized study advice before LLM fine-tuning is available.
 * Stateless — pure function of (profile, prediction) → feedback.
 */

const RECOMMENDATIONS = {
  lowStudy: (hours) => ({
    icon: '📚',
    severity: 'warning',
    title: 'Study More',
    text: `You're studying ${hours} hours/day. Increasing to ${Math.min(hours + 2, 8).toFixed(1)}+ hours could raise your final score by 5–10 points. Try the Pomodoro technique: 25-min focused sessions with 5-min breaks.`,
  }),
  veryLowStudy: (hours) => ({
    icon: '🚨',
    severity: 'danger',
    title: 'Critical: Low Study Time',
    text: `At ${hours} hours/day, your study time is critically low. Students who study 4+ hours daily score 15+ points higher on average. Start with just 30 minutes after class — small habits build momentum.`,
  }),
  goodStudy: (hours) => ({
    icon: '✅',
    severity: 'success',
    title: 'Great Study Discipline',
    text: `You're maintaining ${hours} hours of study per day — that's above average. Keep it up! Review your notes within 24 hours of class for maximum retention (Ebbinghaus curve).`,
  }),
  lowSleep: (hours) => ({
    icon: '😴',
    severity: 'warning',
    title: 'Improve Sleep Habits',
    text: `You're getting ${hours} hours of sleep. Aim for 7–9 hours. Good sleep reinforces memory consolidation — what you study is better remembered after proper rest.`,
  }),
  goodSleep: (hours) => ({
    icon: '✅',
    severity: 'success',
    title: 'Healthy Sleep Schedule',
    text: `You're getting ${hours} hours of sleep — that's in the healthy range. Research shows consistent sleep timing is just as important as duration.`,
  }),
  lowAttendance: (pct) => ({
    icon: '⚠️',
    severity: 'warning',
    title: 'Attendance Concern',
    text: `Your attendance is at ${pct}%. Missing class means missing direct instruction and in-class examples. Try to maintain at least 85% attendance — every session improves understanding.`,
  }),
  veryLowAttendance: (pct) => ({
    icon: '🚨',
    severity: 'danger',
    title: 'Critical Attendance Issue',
    text: `Attendance at ${pct}% is severely below par. Students below 60% attendance fail at over 3x the rate of regular attendees. Work with your academic advisor to identify barriers.`,
  }),
  goodAttendance: (pct) => ({
    icon: '✅',
    severity: 'success',
    title: 'Excellent Attendance',
    text: `At ${pct}%, your attendance is strong. Consistent attendance is one of the strongest predictors of academic success — you're investing well.`,
  }),
  lowGPA: (gpa) => ({
    icon: '📊',
    severity: 'warning',
    title: 'GPA Could Improve',
    text: `Your current GPA of ${gpa.toFixed(1)} has room for improvement. Focus on core subjects: mastering fundamentals raises GPAs cumulative across all classes.`,
  }),
  highGPA: (gpa) => ({
    icon: '🏆',
    severity: 'success',
    title: 'Strong Academic Foundation',
    text: `Your GPA of ${gpa.toFixed(1)} is solid. Challenge yourself with advanced material — peer tutoring others is a proven way to deepen your own understanding.`,
  }),
  partTimeJobRisk: () => ({
    icon: '💼',
    severity: 'warning',
    title: 'Work-Study Balance',
    text: 'Working while studying requires strong time management. Block specific study hours in your calendar and treat them like work shifts — non-negotiable.',
  }),
  internetNoAccess: () => ({
    icon: '🌐',
    severity: 'info',
    title: 'Digital Resources',
    text: 'Leverage campus computer labs for online courses, flashcards (Anki is free), and digital textbooks. Many libraries offer free Raspberry Pi / Chromebook rental.',
  }),
  extracurricularBalance: () => ({
    icon: '⚽',
    severity: 'info',
    title: 'Extracurricular Balance',
    text: 'Sports and clubs build valuable soft skills, but make sure to guard at least 3 hours of focused study per day. When activities dominate your schedule, grades suffer.',
  }),
  generalPositive: () => ({
    icon: '🎯',
    severity: 'success',
    title: 'You Are on the Right Track',
    text: 'Your study habits and profile look good. Keep consistent — academic success comes from small daily actions, not occasional marathon sessions.',
  }),
  gradeAdvice: (grade, score) => ({
    A: { icon: '🌟', severity: 'success', title: 'Outstanding Performance', text: `Predicted grade: A (${score}/100). Your habits are excellent — keep challenging yourself. Consider mentoring peers or seeking advanced supplementary materials.` },
    B: { icon: '📈', severity: 'success', title: 'Good Performance', text: `Predicted grade: B (${score}/100). You're doing well! Identify which skills cost you points — is it exams, assignments, or participation? Target that one area for improvement.` },
    C: { icon: '📝', severity: 'warning', title: 'Room for Improvement', text: `Predicted grade: C (${score}/100). There's potential! The biggest lever is study hours: 30 more minutes per day can push you from C to B territory. Create a narrow plan.` },
    D: { icon: '⚠️', severity: 'danger', title: 'Needs Attention', text: `Predicted grade: D (${score}/100). Immediate intervention recommended: attend office hours, form a group, review fundament tasks, practice with past exam problems daily.` },
    F: { icon: '🚨', severity: 'danger', title: 'At Risk of Failing', text: `Predicted grade: F (${score}/100). This is serious. Speak with your academic advisor immediately. Request a study skills workshop, peer tutor or academic probation support. There ARE resources available.` },
  }[grade] || {}),
};

/**
 * Generate personalized feedback and recommendations for a student profile.
 *
 * @param {Object} profile — student input fields
 *   { gender, age, study_hours_per_day, attendance_percent, sleep_hours, previous_gpa,
 *     parental_education, internet_access, extracurricular, part_time_job }
 * @param {Object} prediction — ML prediction output
 *   { final_score, grade, grade_confidence, grade_probabilities }
 * @returns {{ text: string, recommendations: Array<{icon,severity,title,text}> }}
 */
function generateFeedback(profile, prediction) {
  const recommendations = [];
  const studyHours = parseFloat(profile.study_hours_per_day) || 0;
  const sleepHours = parseFloat(profile.sleep_hours) || 0;
  const attendance = parseFloat(profile.attendance_percent) || 0;
  const gpa = parseFloat(profile.previous_gpa) || 0;
  const hasPartTimeJob = ['yes', '1', 'true', 1, true].includes(
    String(profile.part_time_job).toLowerCase()
  );
  const hasInternet = !['no', '0', 'false', 0, false].includes(
    String(profile.internet_access).toLowerCase()
  );
  const extracurr = ['yes', '1', 'true', 1, true].includes(
    String(profile.extracurricular).toLowerCase()
  );

  // Study hours
  if (studyHours < 2) recommendations.push(RECOMMENDATIONS.veryLowStudy(studyHours));
  else if (studyHours < 4) recommendations.push(RECOMMENDATIONS.lowStudy(studyHours));
  else if (studyHours >= 5) recommendations.push(RECOMMENDATIONS.goodStudy(studyHours));

  // Sleep
  if (sleepHours < 6) recommendations.push(RECOMMENDATIONS.lowSleep(sleepHours));
  else if (sleepHours >= 7) recommendations.push(RECOMMENDATIONS.goodSleep(sleepHours));

  // Attendance
  if (attendance < 70) recommendations.push(RECOMMENDATIONS.veryLowAttendance(attendance));
  else if (attendance < 80) recommendations.push(RECOMMENDATIONS.lowAttendance(attendance));
  else if (attendance >= 90) recommendations.push(RECOMMENDATIONS.goodAttendance(attendance));

  // GPA
  if (gpa < 2.5) recommendations.push(RECOMMENDATIONS.lowGPA(gpa));
  else if (gpa >= 3.5) recommendations.push(RECOMMENDATIONS.highGPA(gpa));

  // Life factors
  if (hasPartTimeJob && (studyHours < 4 || gpa < 2.5)) {
    recommendations.push(RECOMMENDATIONS.partTimeJobRisk());
  }
  if (!hasInternet) recommendations.push(RECOMMENDATIONS.internetNoAccess());
  if (extracurr && studyHours < 4) {
    recommendations.push(RECOMMENDATIONS.extracurricularBalance());
  }

  // Grade-specific advice
  const grade = (prediction.grade || 'C').toUpperCase();
  const score = prediction.final_score || 3;
  if (RECOMMENDATIONS.gradeAdvice(grade, score)) {
    recommendations.push(RECOMMENDATIONS.gradeAdvice(grade, score));
  }

  // Default positive if on recommendations
  if (recommendations.length < 2) {
    recommendations.unshift(RECOMMENDATIONS.generalPositive());
  }

  // Build share text
  const text = recommendations.map(r => `${r.icon} **${r.title}**: ${r.text}`).join('\n\n');

  return { text, recommendations };
}

module.exports = { generateFeedback };