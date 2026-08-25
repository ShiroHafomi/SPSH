/**
 * Study Goal Service — ALL SQL for study goals and weekly check-ins.
 * Parameterized queries only. No raw SQL in controllers/routes.
 */
const { pool } = require('../config/db');

const VALID_STATUSES = ['active', 'completed', 'paused', 'cancelled'];
const VALID_GRADES = ['A', 'B', 'C', 'D', 'F'];

/**
 * Create the study_goals table if it doesn't exist.
 */
async function ensureStudyGoalsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS study_goals (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      student_id INT UNSIGNED NOT NULL,
      target_score DECIMAL(5,2) NULL,
      target_grade ENUM('A', 'B', 'C', 'D', 'F') NULL,
      target_study_hours DECIMAL(5,2) NULL,
      target_attendance DECIMAL(5,2) NULL,
      deadline DATE NULL,
      status ENUM('active', 'completed', 'paused', 'cancelled') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_student_id (student_id),
      INDEX idx_status (status),
      INDEX idx_deadline (deadline),
      CONSTRAINT fk_study_goals_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Create the weekly_checkins table if it doesn't exist.
 */
async function ensureWeeklyCheckinsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weekly_checkins (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      goal_id INT UNSIGNED NOT NULL,
      study_hours DECIMAL(5,2) NOT NULL,
      sleep_hours DECIMAL(5,2) NOT NULL,
      attendance_percent DECIMAL(5,2) NOT NULL,
      current_score DECIMAL(5,2) NULL,
      student_note TEXT NULL,
      teacher_feedback TEXT NULL,
      week_start DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_goal_id (goal_id),
      INDEX idx_week_start (week_start),
      INDEX idx_goal_week (goal_id, week_start),
      CONSTRAINT fk_weekly_checkins_goal FOREIGN KEY (goal_id) REFERENCES study_goals (id) ON DELETE CASCADE,
      UNIQUE KEY uk_goal_week (goal_id, week_start)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Create a new study goal.
 * @param {Object} opts - { studentId, targetScore, targetGrade, targetStudyHours, targetAttendance, deadline, status }
 * @returns {Promise<Object>} Created goal
 */
async function createGoal({ studentId, targetScore, targetGrade, targetStudyHours, targetAttendance, deadline, status }) {
  const [result] = await pool.query(
    `INSERT INTO study_goals (student_id, target_score, target_grade, target_study_hours, target_attendance, deadline, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [studentId, targetScore, targetGrade, targetStudyHours, targetAttendance, deadline, status]
  );

  return {
    id: result.insertId,
    student_id: studentId,
    target_score: targetScore,
    target_grade: targetGrade,
    target_study_hours: targetStudyHours,
    target_attendance: targetAttendance,
    deadline: deadline,
    status: status,
  };
}

/**
 * Get a goal by ID.
 * @param {number} goalId
 * @returns {Promise<Object|null>}
 */
async function getGoalById(goalId) {
  const [rows] = await pool.query(
    `SELECT * FROM study_goals WHERE id = ?`,
    [goalId]
  );
  return rows[0] || null;
}

/**
 * Get all goals for a student.
 * @param {number} studentId
 * @returns {Promise<Array>}
 */
async function getGoalsByStudent(studentId) {
  const [rows] = await pool.query(
    `SELECT * FROM study_goals WHERE student_id = ? ORDER BY created_at DESC`,
    [studentId]
  );
  return rows;
}

/**
 * Update a goal by ID.
 * @param {number} goalId
 * @param {Object} updates
 * @returns {Promise<boolean>}
 */
async function updateGoal(goalId, updates) {
  const fields = [];
  const values = [];

  if (updates.targetScore !== undefined) {
    fields.push('target_score = ?');
    values.push(updates.targetScore);
  }
  if (updates.targetGrade !== undefined) {
    fields.push('target_grade = ?');
    values.push(updates.targetGrade);
  }
  if (updates.targetStudyHours !== undefined) {
    fields.push('target_study_hours = ?');
    values.push(updates.targetStudyHours);
  }
  if (updates.targetAttendance !== undefined) {
    fields.push('target_attendance = ?');
    values.push(updates.targetAttendance);
  }
  if (updates.deadline !== undefined) {
    fields.push('deadline = ?');
    values.push(updates.deadline);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) {
    return false;
  }

  values.push(goalId);

  const [result] = await pool.query(
    `UPDATE study_goals SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  return result.affectedRows > 0;
}

/**
 * Delete a goal by ID.
 * @param {number} goalId
 * @returns {Promise<boolean>}
 */
async function deleteGoal(goalId) {
  const [result] = await pool.query(
    `DELETE FROM study_goals WHERE id = ?`,
    [goalId]
  );
  return result.affectedRows > 0;
}

/**
 * Check if a student has an active goal.
 * @param {number} studentId
 * @returns {Promise<Object|null>}
 */
async function getActiveGoalByStudent(studentId) {
  const [rows] = await pool.query(
    `SELECT * FROM study_goals WHERE student_id = ? AND status = 'active' LIMIT 1`,
    [studentId]
  );
  return rows[0] || null;
}

/**
 * Create a weekly check-in.
 * @param {Object} opts - { goalId, studyHours, sleepHours, attendancePercent, currentScore, studentNote, teacherFeedback, weekStart }
 * @returns {Promise<Object>} Created check-in
 */
async function createCheckIn({ goalId, studyHours, sleepHours, attendancePercent, currentScore, studentNote, teacherFeedback, weekStart }) {
  const [result] = await pool.query(
    `INSERT INTO weekly_checkins (goal_id, study_hours, sleep_hours, attendance_percent, current_score, student_note, teacher_feedback, week_start)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [goalId, studyHours, sleepHours, attendancePercent, currentScore, studentNote, teacherFeedback, weekStart]
  );

  return {
    id: result.insertId,
    goal_id: goalId,
    study_hours: studyHours,
    sleep_hours: sleepHours,
    attendance_percent: attendancePercent,
    current_score: currentScore,
    student_note: studentNote,
    teacher_feedback: teacherFeedback,
    week_start: weekStart,
  };
}

/**
 * Get check-ins for a goal.
 * @param {number} goalId
 * @returns {Promise<Array>}
 */
async function getCheckInsByGoal(goalId) {
  const [rows] = await pool.query(
    `SELECT * FROM weekly_checkins WHERE goal_id = ? ORDER BY week_start ASC`,
    [goalId]
  );
  return rows;
}

/**
 * Get a check-in by ID.
 * @param {number} checkInId
 * @returns {Promise<Object|null>}
 */
async function getCheckInById(checkInId) {
  const [rows] = await pool.query(
    `SELECT * FROM weekly_checkins WHERE id = ?`,
    [checkInId]
  );
  return rows[0] || null;
}

/**
 * Get check-in by goal and week.
 * @param {number} goalId
 * @param {string} weekStart - Date in YYYY-MM-DD format
 * @returns {Promise<Object|null>}
 */
async function getCheckInByGoalAndWeek(goalId, weekStart) {
  const [rows] = await pool.query(
    `SELECT * FROM weekly_checkins WHERE goal_id = ? AND week_start = ?`,
    [goalId, weekStart]
  );
  return rows[0] || null;
}

/**
 * Update a check-in.
 * @param {number} checkInId
 * @param {Object} updates
 * @returns {Promise<boolean>}
 */
async function updateCheckIn(checkInId, updates) {
  const fields = [];
  const values = [];

  if (updates.studyHours !== undefined) {
    fields.push('study_hours = ?');
    values.push(updates.studyHours);
  }
  if (updates.sleepHours !== undefined) {
    fields.push('sleep_hours = ?');
    values.push(updates.sleepHours);
  }
  if (updates.attendancePercent !== undefined) {
    fields.push('attendance_percent = ?');
    values.push(updates.attendancePercent);
  }
  if (updates.currentScore !== undefined) {
    fields.push('current_score = ?');
    values.push(updates.currentScore);
  }
  if (updates.studentNote !== undefined) {
    fields.push('student_note = ?');
    values.push(updates.studentNote);
  }
  if (updates.teacherFeedback !== undefined) {
    fields.push('teacher_feedback = ?');
    values.push(updates.teacherFeedback);
  }

  if (fields.length === 0) {
    return false;
  }

  values.push(checkInId);

  const [result] = await pool.query(
    `UPDATE weekly_checkins SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  return result.affectedRows > 0;
}

/**
 * Delete a check-in.
 * @param {number} checkInId
 * @returns {Promise<boolean>}
 */
async function deleteCheckIn(checkInId) {
  const [result] = await pool.query(
    `DELETE FROM weekly_checkins WHERE id = ?`,
    [checkInId]
  );
  return result.affectedRows > 0;
}

/**
 * Get progress summary for a goal.
 * @param {number} goalId
 * @returns {Promise<Object>}
 */
async function getGoalProgress(goalId) {
  const goal = await getGoalById(goalId);
  if (!goal) {
    return null;
  }

  const checkIns = await getCheckInsByGoal(goalId);

  if (!checkIns.length) {
    return {
      goal,
      checkInsCount: 0,
      latestCheckIn: null,
      progressPercentage: 0,
      status: 'insufficient_data',
    };
  }

  const completedCheckIns = checkIns.filter(c => c.current_score !== null);
  const latest = checkIns[checkIns.length - 1];

  // Calculate averages
  const avgStudyHours = checkIns.reduce((sum, c) => sum + Number(c.study_hours || 0), 0) / checkIns.length;
  const avgSleepHours = checkIns.reduce((sum, c) => sum + Number(c.sleep_hours || 0), 0) / checkIns.length;
  const avgAttendance = checkIns.reduce((sum, c) => sum + Number(c.attendance_percent || 0), 0) / checkIns.length;

  // Calculate score change from first check-in
  const firstCheckIn = checkIns[0];
  const scoreChange = firstCheckIn && firstCheckIn.current_score !== null && latest.current_score !== null
    ? Number(latest.current_score) - Number(firstCheckIn.current_score)
    : null;

  // Calculate distance from target score
  const targetScore = goal.target_score;
  const currentScore = latest.current_score;
  const distanceFromTarget = targetScore && currentScore !== null
    ? Math.abs(Number(targetScore) - Number(currentScore))
    : null;

  // Calculate progress percentage based on attendance and study hours
  let progressPercentage = 0;
  if (goal.target_attendance && goal.target_study_hours) {
    const attendanceProgress = (avgAttendance / Number(goal.target_attendance)) * 50;
    const studyProgress = (avgStudyHours / Number(goal.target_study_hours)) * 50;
    progressPercentage = Math.min(100, attendanceProgress + studyProgress);
  } else if (avgAttendance > 0) {
    progressPercentage = Math.min(100, (avgAttendance / 100) * 50 + (avgStudyHours / 20) * 50);
  }

  // Determine status
  let status = 'on_track';
  if (!completedCheckIns.length) {
    status = 'insufficient_data';
  } else if (completedCheckIns.length < 2 || progressPercentage < 50) {
    status = 'needs_attention';
  }

  return {
    goal,
    checkInsCount: checkIns.length,
    latestCheckIn: latest,
    avgStudyHours: Number(avgStudyHours.toFixed(2)),
    avgSleepHours: Number(avgSleepHours.toFixed(2)),
    avgAttendance: Number(avgAttendance.toFixed(2)),
    scoreChange: scoreChange !== null ? Number(scoreChange.toFixed(2)) : null,
    distanceFromTarget: distanceFromTarget !== null ? Number(distanceFromTarget.toFixed(2)) : null,
    progressPercentage: Number(progressPercentage.toFixed(2)),
    status,
  };
}

/**
 * Validate goal data.
 * @param {Object} data
 * @returns {Array<string>} Errors array
 */
function validateGoalData(data) {
  const errors = [];

  if (data.targetScore !== undefined && data.targetScore !== null) {
    const score = Number(data.targetScore);
    if (isNaN(score) || score < 0 || score > 100) {
      errors.push('target_score must be between 0 and 100.');
    }
  }

  if (data.targetGrade !== undefined && data.targetGrade !== null) {
    if (!VALID_GRADES.includes(data.targetGrade)) {
      errors.push('target_grade must be one of: A, B, C, D, F.');
    }
  }

  if (data.targetStudyHours !== undefined && data.targetStudyHours !== null) {
    const hours = Number(data.targetStudyHours);
    if (isNaN(hours) || hours < 0 || hours > 112) {
      errors.push('target_study_hours must be between 0 and 112.');
    }
  }

  if (data.targetAttendance !== undefined && data.targetAttendance !== null) {
    const attendance = Number(data.targetAttendance);
    if (isNaN(attendance) || attendance < 0 || attendance > 100) {
      errors.push('target_attendance must be between 0 and 100.');
    }
  }

  if (data.deadline !== undefined && data.deadline !== null) {
    const deadline = new Date(data.deadline);
    if (isNaN(deadline.getTime())) {
      errors.push('deadline must be a valid date.');
    } else {
      // For active goals, deadline cannot be in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (data.status === 'active' && deadline < today) {
        errors.push('Active goal deadline cannot be in the past.');
      }
    }
  }

  if (data.status !== undefined && data.status !== null) {
    if (!VALID_STATUSES.includes(data.status)) {
      errors.push('status must be one of: active, completed, paused, cancelled.');
    }
  }

  return errors;
}

/**
 * Validate check-in data.
 * @param {Object} data
 * @returns {Array<string>} Errors array
 */
function validateCheckInData(data) {
  const errors = [];

  if (data.studyHours !== undefined && data.studyHours !== null) {
    const hours = Number(data.studyHours);
    if (isNaN(hours) || hours < 0 || hours > 24) {
      errors.push('study_hours must be between 0 and 24.');
    }
  } else {
    errors.push('study_hours is required.');
  }

  if (data.sleepHours !== undefined && data.sleepHours !== null) {
    const hours = Number(data.sleepHours);
    if (isNaN(hours) || hours < 0 || hours > 24) {
      errors.push('sleep_hours must be between 0 and 24.');
    }
  } else {
    errors.push('sleep_hours is required.');
  }

  if (data.attendancePercent !== undefined && data.attendancePercent !== null) {
    const attendance = Number(data.attendancePercent);
    if (isNaN(attendance) || attendance < 0 || attendance > 100) {
      errors.push('attendance_percent must be between 0 and 100.');
    }
  } else {
    errors.push('attendance_percent is required.');
  }

  if (data.weekStart !== undefined && data.weekStart !== null) {
    const weekStart = new Date(data.weekStart);
    if (isNaN(weekStart.getTime())) {
      errors.push('week_start must be a valid date.');
    }
  } else {
    errors.push('week_start is required.');
  }

  if (data.studentNote !== undefined && data.studentNote !== null) {
    if (typeof data.studentNote !== 'string' || data.studentNote.length > 1000) {
      errors.push('student_note cannot exceed 1000 characters.');
    }
  }

  if (data.teacherFeedback !== undefined && data.teacherFeedback !== null) {
    if (typeof data.teacherFeedback !== 'string' || data.teacherFeedback.length > 1000) {
      errors.push('teacher_feedback cannot exceed 1000 characters.');
    }
  }

  return errors;
}

module.exports = {
  ensureStudyGoalsTable,
  ensureWeeklyCheckinsTable,
  createGoal,
  getGoalById,
  getGoalsByStudent,
  getActiveGoalByStudent,
  updateGoal,
  deleteGoal,
  createCheckIn,
  getCheckInById,
  getCheckInByGoalAndWeek,
  getCheckInsByGoal,
  updateCheckIn,
  deleteCheckIn,
  getGoalProgress,
  validateGoalData,
  validateCheckInData,
  VALID_STATUSES,
  VALID_GRADES,
};