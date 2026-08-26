/**
 * Study Goal Service — ALL SQL for study goals and weekly check-ins.
 * Parameterized queries only. No raw SQL in controllers/routes.
 */
const { pool } = require('../config/db');
const { calculateProgress } = require('./studyProgressService');

const VALID_STATUSES = ['active', 'completed', 'paused', 'cancelled'];
const VALID_GRADES = ['A', 'B', 'C', 'D', 'F'];

class ActiveGoalExistsError extends Error {
  constructor() {
    super('Cannot create a new active goal. You already have an active goal.');
    this.name = 'ActiveGoalExistsError';
    this.code = 'ACTIVE_GOAL_EXISTS';
  }
}

function isCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

async function withStudentGoalLock(studentId, operation) {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    // Lock the student row so active-goal transitions for one student serialize,
    // including the case where that student does not yet have a goal row.
    await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);

    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (err) {
    if (transactionStarted) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

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
      notification_revision INT UNSIGNED NOT NULL DEFAULT 1,
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
  await pool.query(
    `ALTER TABLE weekly_checkins
     ADD COLUMN IF NOT EXISTS notification_revision INT UNSIGNED NOT NULL DEFAULT 1
     AFTER teacher_feedback`
  );
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
 * Create a goal while serializing active-goal checks for this student. A
 * controller-level read before insert is not sufficient because two requests
 * can otherwise both observe no active goal and create one concurrently.
 */
async function createGoalForStudent({ studentId, targetScore, targetGrade, targetStudyHours, targetAttendance, deadline, status }) {
  return withStudentGoalLock(studentId, async (connection) => {
    if (status === 'active') {
      const [activeGoals] = await connection.query(
        `SELECT id FROM study_goals WHERE student_id = ? AND status = 'active' LIMIT 1`,
        [studentId]
      );
      if (activeGoals.length) throw new ActiveGoalExistsError();
    }

    const [result] = await connection.query(
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
      deadline,
      status,
    };
  });
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
 * Get one goal only when it belongs to the supplied student.
 * This is the service-level ownership boundary for staff goal detail routes.
 */
async function getGoalByIdForStudent(goalId, studentId) {
  const [rows] = await pool.query(
    `SELECT * FROM study_goals WHERE id = ? AND student_id = ?`,
    [goalId, studentId]
  );
  return rows[0] || null;
}

/**
 * Get a bounded page of goals for one student.
 */
async function getGoalsByStudentPage(studentId, { size, offset }) {
  const [rows] = await pool.query(
    `SELECT * FROM study_goals WHERE student_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [studentId, size, offset]
  );
  return rows;
}

/**
 * Count goals for a student to support administrative pagination.
 */
async function countGoalsByStudent(studentId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM study_goals WHERE student_id = ?`,
    [studentId]
  );
  return Number(row?.total) || 0;
}

/**
 * Update a goal by ID.
 * @param {number} goalId
 * @param {Object} updates
 * @returns {Promise<boolean>}
 */
function addGoalUpdateFields(updates) {
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

  return { fields, values };
}

async function updateGoal(goalId, updates) {
  const { fields, values } = addGoalUpdateFields(updates);
  if (fields.length === 0) return false;

  values.push(goalId);
  const [result] = await pool.query(
    `UPDATE study_goals SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  return result.affectedRows > 0;
}

/**
 * Update a goal that belongs to one student while serializing active status
 * transitions for that student. This prevents a paused/completed goal from
 * becoming active alongside an already active goal.
 */
async function updateGoalForStudent(studentId, goalId, updates) {
  return withStudentGoalLock(studentId, async (connection) => {
    const [goals] = await connection.query(
      `SELECT id, status FROM study_goals WHERE id = ? AND student_id = ?`,
      [goalId, studentId]
    );
    const currentGoal = goals[0];
    if (!currentGoal) return { found: false, updated: false };

    if (updates.status === 'active' && currentGoal.status !== 'active') {
      const [activeGoals] = await connection.query(
        `SELECT id FROM study_goals WHERE student_id = ? AND status = 'active' AND id <> ? LIMIT 1`,
        [studentId, goalId]
      );
      if (activeGoals.length) throw new ActiveGoalExistsError();
    }

    const { fields, values } = addGoalUpdateFields(updates);
    if (!fields.length) return { found: true, updated: false };

    values.push(goalId, studentId);
    const [result] = await connection.query(
      `UPDATE study_goals SET ${fields.join(', ')} WHERE id = ? AND student_id = ?`,
      values
    );
    return { found: true, updated: result.affectedRows > 0 };
  });
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
 * Get a deterministic, bounded set of active goals for on-demand reminder sync.
 * Callers request one more than their processing cap so they can report truncation
 * without ever scanning the rest of the student's goals.
 */
async function getActiveGoalReminderCandidates(studentId, { limit }) {
  const [rows] = await pool.query(
    `SELECT id, student_id, deadline
     FROM study_goals
     WHERE student_id = ? AND status = 'active'
     ORDER BY deadline IS NULL ASC, deadline ASC, id ASC
     LIMIT ?`,
    [studentId, limit]
  );
  return rows;
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
    notification_revision: 1,
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
 * Resolve a check-in only when its goal belongs to the supplied student.
 * A missing, mismatched, or deleted resource all resolve to null so callers can
 * use one non-disclosing 404 response.
 */
async function getCheckInByIdForGoalAndStudent(checkInId, goalId, studentId) {
  const [rows] = await pool.query(
    `SELECT weekly_checkins.*
     FROM weekly_checkins
     INNER JOIN study_goals ON study_goals.id = weekly_checkins.goal_id
     WHERE weekly_checkins.id = ?
       AND weekly_checkins.goal_id = ?
       AND study_goals.student_id = ?`,
    [checkInId, goalId, studentId]
  );
  return rows[0] || null;
}

/**
 * Change only teacher_feedback while enforcing the check-in, goal, and student
 * relationship in one parameterized statement.
 */
async function updateTeacherFeedbackForGoal(checkInId, goalId, studentId, teacherFeedback) {
  const [result] = await pool.query(
    `UPDATE weekly_checkins
     INNER JOIN study_goals ON study_goals.id = weekly_checkins.goal_id
     SET weekly_checkins.teacher_feedback = ?
     WHERE weekly_checkins.id = ?
       AND weekly_checkins.goal_id = ?
       AND study_goals.student_id = ?`,
    [teacherFeedback, checkInId, goalId, studentId]
  );
  return result.affectedRows > 0;
}

/**
 * Update teacher feedback only when its persisted value changes, then load the
 * fresh scoped record so callers receive its authoritative revision and timestamps.
 */
async function updateTeacherFeedbackWithOutcome(checkInId, goalId, studentId, teacherFeedback) {
  const [result] = await pool.query(
    `UPDATE weekly_checkins
     INNER JOIN study_goals ON study_goals.id = weekly_checkins.goal_id
     SET weekly_checkins.teacher_feedback = ?,
         weekly_checkins.notification_revision = weekly_checkins.notification_revision + 1
     WHERE weekly_checkins.id = ?
       AND weekly_checkins.goal_id = ?
       AND study_goals.student_id = ?
       AND NOT (weekly_checkins.teacher_feedback <=> ?)`,
    [teacherFeedback, checkInId, goalId, studentId, teacherFeedback]
  );

  const checkIn = await getCheckInByIdForGoalAndStudent(checkInId, goalId, studentId);
  return {
    checkIn,
    changed: result.affectedRows > 0,
  };
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
  if (updates.weekStart !== undefined) {
    fields.push('week_start = ?');
    values.push(updates.weekStart);
  }

  if (fields.length === 0) {
    return false;
  }

  fields.push('notification_revision = notification_revision + 1');
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
 * Load and calculate progress for one goal. Kept as a backward-compatible
 * database wrapper around the pure studyProgressService calculation.
 */
async function getGoalProgress(goalId, { now } = {}) {
  const goal = await getGoalById(goalId);
  if (!goal) return null;

  const checkIns = await getCheckInsByGoal(goalId);
  const progress = calculateProgress(goal, checkIns, { now });
  return {
    goal,
    checkInsCount: progress.totalCheckIns,
    latestCheckIn: progress.latestCheckIn,
    avgStudyHours: progress.averageWeeklyStudyHours,
    avgSleepHours: progress.averageSleepHours,
    avgAttendance: progress.averageAttendance,
    scoreChange: progress.scoreChange,
    distanceFromTarget: progress.distanceFromTargetScore,
    progressPercentage: progress.progressPercentage,
    status: progress.status,
  };
}

/**
 * Load a goal detail only if the goal belongs to the requested student.
 */
async function getGoalWithProgressForStudent(studentId, goalId, { now } = {}) {
  const goal = await getGoalByIdForStudent(goalId, studentId);
  if (!goal) return null;

  const checkIns = await getCheckInsByGoal(goalId);
  return {
    goal,
    checkIns,
    progress: calculateProgress(goal, checkIns, { now }),
  };
}

/**
 * Enrich goals with their check-in histories and deterministic progress.
 * The optional bounds are used by the admin list; teachers omit them and get
 * all goals for their selected student.
 */
async function getGoalsWithProgressByStudent(studentId, { page, size, now } = {}) {
  const hasPagination = Number.isSafeInteger(page) && Number.isSafeInteger(size);
  const goals = hasPagination
    ? await getGoalsByStudentPage(studentId, { size, offset: (page - 1) * size })
    : await getGoalsByStudent(studentId);

  return Promise.all(goals.map(async (goal) => {
    const checkIns = await getCheckInsByGoal(goal.id);
    return {
      goal,
      checkIns,
      progress: calculateProgress(goal, checkIns, { now }),
    };
  }));
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
    if (!isCalendarDate(data.deadline)) {
      errors.push('deadline must be a valid date.');
    } else {
      // Compare calendar dates in UTC to avoid local-timezone rollover.
      const deadline = new Date(`${data.deadline}T00:00:00.000Z`);
      const today = new Date();
      const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      if (data.status === 'active' && deadline.getTime() < todayUtc) {
        errors.push('Active goal deadline cannot be in the past.');
      }
    }
  }

  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    errors.push('status must be one of: active, completed, paused, cancelled.');
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
    if (!isCalendarDate(data.weekStart)) {
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
  createGoalForStudent,
  getGoalById,
  getGoalByIdForStudent,
  getGoalsByStudent,
  getGoalsByStudentPage,
  countGoalsByStudent,
  getGoalsWithProgressByStudent,
  getGoalWithProgressForStudent,
  getActiveGoalByStudent,
  getActiveGoalReminderCandidates,
  updateGoal,
  updateGoalForStudent,
  deleteGoal,
  createCheckIn,
  getCheckInById,
  getCheckInByIdForGoalAndStudent,
  getCheckInByGoalAndWeek,
  getCheckInsByGoal,
  updateCheckIn,
  updateTeacherFeedbackForGoal,
  updateTeacherFeedbackWithOutcome,
  deleteCheckIn,
  getGoalProgress,
  validateGoalData,
  validateCheckInData,
  isCalendarDate,
  ActiveGoalExistsError,
  VALID_STATUSES,
  VALID_GRADES,
};
