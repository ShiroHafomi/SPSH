'use strict';

const { pool } = require('../config/db');
const authService = require('./authService');
const notificationService = require('./notificationService');
const { parsePositiveSafeInteger } = require('../utils/inputValidation');
const {
  SupportPlanError, positiveId, validateDraft, validateList,
  validateTransition, validateTaskUpdate, progress,
} = require('../utils/supportPlanValidation');

const PLAN_COLUMNS = `p.id, p.student_id, p.created_by_user_id, p.title, p.objective, p.status,
  DATE_FORMAT(p.start_date, '%Y-%m-%d') AS start_date,
  DATE_FORMAT(p.due_date, '%Y-%m-%d') AS due_date,
  p.version, p.created_at, p.updated_at, p.completed_at`;
const TASK_COLUMNS = `id, plan_id, title, description, status,
  DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, sort_order, version,
  completed_at, created_at, updated_at`;

function studentTable() {
  const table = process.env.DB_TABLE || 'students';
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(table)) throw new Error('Invalid student table configuration.');
  return `\`${table}\``;
}

async function ensureSupportPlanTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS academic_support_plans (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id INT UNSIGNED NOT NULL,
    created_by_user_id INT UNSIGNED NULL,
    title VARCHAR(150) NOT NULL,
    objective TEXT NOT NULL,
    status ENUM('draft', 'active', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
    start_date DATE NOT NULL,
    due_date DATE NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    completed_at DATETIME(6) NULL,
    INDEX idx_support_student_created (student_id, created_at, id),
    INDEX idx_support_student_status (student_id, status, created_at, id),
    CONSTRAINT fk_support_plan_student FOREIGN KEY (student_id) REFERENCES ${studentTable()} (id) ON DELETE CASCADE,
    CONSTRAINT fk_support_plan_creator FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS academic_support_tasks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    plan_id INT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    status ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
    due_date DATE NULL,
    sort_order INT UNSIGNED NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    completed_at DATETIME(6) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_support_task_order (plan_id, sort_order, id),
    CONSTRAINT fk_support_task_plan FOREIGN KEY (plan_id) REFERENCES academic_support_plans (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function scope(actor, requestedStudentId, staffOnly = false) {
  if (parsePositiveSafeInteger(actor?.id) === null) {
    throw new SupportPlanError(401, 'AUTH_REQUIRED', 'Authentication required.');
  }
  if (actor.role === 'admin') {
    const studentId = positiveId(requestedStudentId);
    if (authService.canAccessStudent(actor, studentId)) return { studentId, student: false };
  }
  if (!staffOnly && actor.role === 'student') {
    const studentId = parsePositiveSafeInteger(actor.studentId);
    if (studentId !== null) return { studentId, student: true };
  }
  // Analytics access is organization-wide; it is not a teacher-to-student assignment.
  throw new SupportPlanError(403, 'SUPPORT_PLAN_FORBIDDEN', 'Support plan access denied.');
}

function notFound() {
  throw new SupportPlanError(404, 'SUPPORT_PLAN_NOT_FOUND', 'Support plan or student not found.');
}
function conflict() {
  throw new SupportPlanError(409, 'SUPPORT_PLAN_CONFLICT', 'Support plan changed. Reload before updating.');
}
function transitionError() {
  throw new SupportPlanError(409, 'SUPPORT_PLAN_INVALID_TRANSITION', 'This support plan action is not available.');
}
function checkVersion(current, expected) {
  if (Number(current) !== expected || Number(current) >= 4294967295) conflict();
}

async function transaction(operation) {
  const connection = await pool.getConnection();
  let started = false;
  try {
    await connection.beginTransaction();
    started = true;
    const result = await operation(connection);
    await connection.commit();
    started = false;
    return result;
  } catch (error) {
    if (started) {
      try { await connection.rollback(); } catch { console.error('[supportPlan] Rollback failed.'); }
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function readPlan(db, access, planId, lock = false) {
  const [rows] = await db.query(
    `SELECT ${PLAN_COLUMNS} FROM academic_support_plans p
     WHERE p.id = ? AND p.student_id = ?${access.student ? " AND p.status <> 'draft'" : ''}
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [planId, access.studentId]
  );
  if (!rows.length) notFound();
  return rows[0];
}
async function detail(db, access, planId, lock = false) {
  const plan = await readPlan(db, access, planId, lock);
  const [tasks] = await db.query(
    `SELECT ${TASK_COLUMNS} FROM academic_support_tasks WHERE plan_id = ? ORDER BY sort_order ASC, id ASC LIMIT 20`,
    [planId]
  );
  return { ...plan, tasks, ...progress(plan, tasks.length, tasks.filter(task => task.status === 'completed').length) };
}

async function listPlans(actor, studentId, query) {
  const access = scope(actor, studentId);
  const { page, size, status } = validateList(query);
  const conditions = ['p.student_id = ?'];
  const values = [access.studentId];
  if (access.student) conditions.push("p.status <> 'draft'");
  if (status) { conditions.push('p.status = ?'); values.push(status); }
  const where = conditions.join(' AND ');
  const [counts] = await pool.query(`SELECT COUNT(*) AS total FROM academic_support_plans p WHERE ${where}`, values);
  const [rows] = await pool.query(
    `SELECT ${PLAN_COLUMNS},
       (SELECT COUNT(*) FROM academic_support_tasks t WHERE t.plan_id = p.id) AS totalTaskCount,
       (SELECT COUNT(*) FROM academic_support_tasks t WHERE t.plan_id = p.id AND t.status = 'completed') AS completedTaskCount
     FROM academic_support_plans p WHERE ${where}
     ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`, [...values, size, (page - 1) * size]
  );
  const total = Number(counts[0].total);
  return { plans: rows.map(row => ({ ...row, ...progress(row, row.totalTaskCount, row.completedTaskCount) })),
    total, page, size, totalPages: Math.ceil(total / size) };
}

async function getPlan(actor, studentId, planId) {
  const access = scope(actor, studentId);
  // A consistent snapshot prevents a draft replacement from mixing old content and new tasks.
  return transaction(db => detail(db, access, positiveId(planId)));
}

async function insertTasks(db, planId, tasks) {
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    await db.query(
      'INSERT INTO academic_support_tasks (plan_id, title, description, due_date, sort_order) VALUES (?, ?, ?, ?, ?)',
      [planId, task.title, task.description, task.due_date, index]
    );
  }
}

async function afterCommit(actor, plan, action, notify = false) {
  const warnings = [];
  try {
    await authService.logAuditEvent({ userId: actor.id, action, resourceType: 'support_plan', resourceId: plan.id,
      metadata: { studentId: plan.student_id, status: plan.status, version: plan.version, taskCount: plan.totalTaskCount },
      ipAddress: null, userAgent: null });
  } catch {
    console.warn('[supportPlan] Optional audit delivery failed.');
    warnings.push('SUPPORT_PLAN_AUDIT_FAILED');
  }
  if (notify) {
    try {
      const userId = await authService.findUniqueActiveStudentUserId(plan.student_id);
      if (userId === null) warnings.push('SUPPORT_PLAN_RECIPIENT_UNAVAILABLE');
      else {
        const preferences = await notificationService.getNotificationPreferences(userId);
        if (preferences.teacherFeedback) {
          await notificationService.createNotification({ userId, type: 'support_plan_activated', metadata: { planId: plan.id } });
        }
      }
    } catch {
      console.warn('[supportPlan] Optional activation notification failed.');
      warnings.push('SUPPORT_PLAN_NOTIFICATION_FAILED');
    }
  }
  return { plan, warnings };
}

async function createPlan(actor, studentId, input) {
  const access = scope(actor, studentId, true);
  const data = validateDraft(input);
  const plan = await transaction(async db => {
    const [students] = await db.query(`SELECT id FROM ${studentTable()} WHERE id = ? LIMIT 1 FOR UPDATE`, [access.studentId]);
    if (!students.length) notFound();
    const [result] = await db.query(
      `INSERT INTO academic_support_plans (student_id, created_by_user_id, title, objective, start_date, due_date)
       VALUES (?, ?, ?, ?, ?, ?)`, [access.studentId, actor.id, data.title, data.objective, data.start_date, data.due_date]
    );
    await insertTasks(db, result.insertId, data.tasks);
    return detail(db, access, result.insertId);
  });
  return afterCommit(actor, plan, 'SUPPORT_PLAN_CREATED');
}

async function editPlan(actor, studentId, planId, input) {
  const access = scope(actor, studentId, true);
  const id = positiveId(planId);
  const data = validateDraft(input, { edit: true });
  const plan = await transaction(async db => {
    const current = await readPlan(db, access, id, true);
    checkVersion(current.version, data.version);
    if (current.status !== 'draft') transitionError();
    const [updated] = await db.query(
      `UPDATE academic_support_plans SET title = ?, objective = ?, start_date = ?, due_date = ?, version = version + 1
       WHERE id = ? AND student_id = ? AND version = ?`,
      [data.title, data.objective, data.start_date, data.due_date, id, access.studentId, data.version]
    );
    if (updated.affectedRows !== 1) conflict();
    await db.query('DELETE FROM academic_support_tasks WHERE plan_id = ?', [id]);
    await insertTasks(db, id, data.tasks);
    return detail(db, access, id);
  });
  return afterCommit(actor, plan, 'SUPPORT_PLAN_EDITED');
}

async function transitionPlan(actor, studentId, planId, action, input) {
  const access = scope(actor, studentId, true);
  const id = positiveId(planId);
  const { version } = validateTransition(input);
  if (!['activate', 'complete', 'cancel'].includes(action)) transitionError();
  const status = { activate: 'active', complete: 'completed', cancel: 'cancelled' }[action];
  const plan = await transaction(async db => {
    const current = await detail(db, access, id, true);
    checkVersion(current.version, version);
    if (action === 'activate' && (current.status !== 'draft' || current.totalTaskCount === 0)) transitionError();
    if (action === 'complete' && (current.status !== 'active' || current.totalTaskCount === 0 || current.completedTaskCount !== current.totalTaskCount)) transitionError();
    if (action === 'cancel' && !['draft', 'active'].includes(current.status)) transitionError();
    const [updated] = await db.query(
      `UPDATE academic_support_plans SET status = ?, version = version + 1,
       completed_at = ${action === 'complete' ? 'UTC_TIMESTAMP(6)' : 'NULL'}
       WHERE id = ? AND student_id = ? AND version = ?`, [status, id, access.studentId, version]
    );
    if (updated.affectedRows !== 1) conflict();
    return detail(db, access, id);
  });
  return afterCommit(actor, plan, action === 'activate' ? 'SUPPORT_PLAN_ACTIVATED' : `SUPPORT_PLAN_${status.toUpperCase()}`, action === 'activate');
}

async function updateTask(actor, studentId, planId, taskId, input) {
  const access = scope(actor, studentId);
  const id = positiveId(planId);
  const task = positiveId(taskId);
  const data = validateTaskUpdate(input);
  const plan = await transaction(async db => {
    // Every writer locks the parent first, including task writers and lifecycle actions.
    const current = await detail(db, access, id, true);
    checkVersion(current.version, data.planVersion);
    if (current.status !== 'active') transitionError();
    const existing = current.tasks.find(item => Number(item.id) === task);
    if (!existing) notFound();
    checkVersion(existing.version, data.version);
    if (existing.status === data.status) return current;
    const [updated] = await db.query(
      `UPDATE academic_support_tasks SET status = ?, version = version + 1,
       completed_at = ${data.status === 'completed' ? 'UTC_TIMESTAMP(6)' : 'NULL'}
       WHERE id = ? AND plan_id = ? AND version = ?`, [data.status, task, id, data.version]
    );
    if (updated.affectedRows !== 1) conflict();
    const [parent] = await db.query(
      'UPDATE academic_support_plans SET version = version + 1 WHERE id = ? AND student_id = ? AND version = ?',
      [id, access.studentId, data.planVersion]
    );
    if (parent.affectedRows !== 1) conflict();
    return detail(db, access, id);
  });
  return afterCommit(actor, plan, 'SUPPORT_TASK_UPDATED');
}

module.exports = { ensureSupportPlanTables, listPlans, getPlan, createPlan, editPlan, transitionPlan, updateTask };
