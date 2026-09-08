'use strict';

const { pool } = require('../config/db');
const { JournalError, MAX_VERSION, positiveId, entryInput, deleteInput, listInput } = require('../utils/learningJournalValidation');
const META = "id, title, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date, understanding_rating, version";
function studentTable() {
  const table = process.env.DB_TABLE || 'students';
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(table)) throw new Error('Invalid student table.');
  return `\`${table}\``;
}
async function ensureLearningJournalTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS student_learning_journal (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id INT UNSIGNED NOT NULL,
    owner_user_id INT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    entry_date DATE NOT NULL,
    learned_text TEXT NOT NULL,
    difficulties_text TEXT NOT NULL,
    next_steps_text TEXT NOT NULL,
    understanding_rating TINYINT UNSIGNED NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_journal_student_date (student_id, owner_user_id, entry_date, id),
    CONSTRAINT fk_journal_student FOREIGN KEY (student_id) REFERENCES ${studentTable()} (id) ON DELETE CASCADE,
    CONSTRAINT fk_journal_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_journal_rating CHECK (understanding_rating IS NULL OR understanding_rating BETWEEN 1 AND 5)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
function owner(actor) {
  if (!actor?.id) throw new JournalError(401, 'AUTH_REQUIRED', 'Authentication required.');
  if (actor.role !== 'student' || !actor.studentId) throw new JournalError(403, 'JOURNAL_FORBIDDEN', 'A linked student account is required.');
  return [positiveId(actor.studentId), positiveId(actor.id)];
}
function notFound() { throw new JournalError(404, 'JOURNAL_NOT_FOUND', 'Journal entry not found.'); }
function conflict() { throw new JournalError(409, 'JOURNAL_CONFLICT', 'This entry changed. Reload it before trying again.'); }
async function transaction(operation) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await operation(db);
    await db.commit();
    return result;
  } catch (error) {
    try { await db.rollback(); } catch {}
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) conflict();
    throw error;
  } finally { db.release(); }
}
async function today(db) {
  const [[row]] = await db.query("SELECT DATE_FORMAT(UTC_DATE(), '%Y-%m-%d') AS today");
  if (!row?.today) throw new Error('Database clock unavailable.');
  return row.today;
}
async function select(db, scope, id, locked = false) {
  const [rows] = await db.query(`SELECT ${META}, learned_text, difficulties_text, next_steps_text
    FROM student_learning_journal WHERE student_id = ? AND owner_user_id = ? AND id = ? LIMIT 1${locked ? ' FOR UPDATE' : ''}`, [...scope, id]);
  if (!rows.length) notFound();
  return rows[0];
}
async function list(actor, input) {
  const scope = owner(actor), filters = listInput(input);
  return transaction(async db => {
    const clauses = ['student_id = ?', 'owner_user_id = ?'], args = [...scope];
    if (filters.q) {
      const pattern = `%${filters.q.replace(/[!%_]/g, char => `!${char}`)}%`;
      clauses.push("(title LIKE ? ESCAPE '!' OR learned_text LIKE ? ESCAPE '!' OR difficulties_text LIKE ? ESCAPE '!' OR next_steps_text LIKE ? ESCAPE '!')");
      args.push(pattern, pattern, pattern, pattern);
    }
    if (filters.from) { clauses.push('entry_date >= ?'); args.push(filters.from); }
    if (filters.to) { clauses.push('entry_date <= ?'); args.push(filters.to); }
    if (filters.rating !== null) { clauses.push('understanding_rating = ?'); args.push(filters.rating); }
    const where = clauses.join(' AND ');
    const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM student_learning_journal WHERE ${where}`, args);
    const total = Number(count.total);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid journal count.');
    const totalPages = Math.min(Math.ceil(total / filters.size), Math.floor(100000 / filters.size) + 1);
    const page = totalPages ? Math.min(filters.page, totalPages) : 1;
    const [entries] = await db.query(`SELECT ${META}, LEFT(learned_text, 200) AS learned_preview
      FROM student_learning_journal WHERE ${where} ORDER BY entry_date DESC, id DESC LIMIT ? OFFSET ?`,
    [...args, filters.size, (page - 1) * filters.size]);
    return { entries, pagination: { page, size: filters.size, total, totalPages }, today: await today(db), timeZone: 'UTC' };
  });
}
async function get(actor, entryId) {
  const scope = owner(actor), id = positiveId(entryId);
  return { entry: await select(pool, scope, id), timeZone: 'UTC' };
}
async function create(actor, input) {
  const scope = owner(actor);
  return transaction(async db => {
    const data = entryInput(input, await today(db));
    const [students] = await db.query(`SELECT id FROM ${studentTable()} WHERE id = ? LIMIT 1 FOR SHARE`, [scope[0]]);
    if (!students.length) throw new JournalError(403, 'JOURNAL_FORBIDDEN', 'A linked student account is required.');
    const [result] = await db.query(`INSERT INTO student_learning_journal
      (student_id, owner_user_id, title, entry_date, learned_text, difficulties_text, next_steps_text, understanding_rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [...scope, data.title, data.entry_date, data.learned_text, data.difficulties_text, data.next_steps_text, data.understanding_rating]);
    return { id: result.insertId, version: 1 };
  });
}
async function update(actor, entryId, input) {
  const scope = owner(actor), id = positiveId(entryId);
  return transaction(async db => {
    const data = entryInput(input, await today(db), true);
    const row = await select(db, scope, id, true);
    if (Number(row.version) !== data.version || data.version >= MAX_VERSION) conflict();
    const [result] = await db.query(`UPDATE student_learning_journal SET title = ?, entry_date = ?, learned_text = ?,
      difficulties_text = ?, next_steps_text = ?, understanding_rating = ?, version = version + 1
      WHERE student_id = ? AND owner_user_id = ? AND id = ? AND version = ?`,
    [data.title, data.entry_date, data.learned_text, data.difficulties_text, data.next_steps_text, data.understanding_rating, ...scope, id, data.version]);
    if (result.affectedRows !== 1) conflict();
    return { id, version: data.version + 1 };
  });
}
async function remove(actor, entryId, input) {
  const scope = owner(actor), id = positiveId(entryId), version = deleteInput(input);
  return transaction(async db => {
    const row = await select(db, scope, id, true);
    if (Number(row.version) !== version) conflict();
    const [result] = await db.query('DELETE FROM student_learning_journal WHERE student_id = ? AND owner_user_id = ? AND id = ? AND version = ?', [...scope, id, version]);
    if (result.affectedRows !== 1) conflict();
    return { ok: true };
  });
}
module.exports = { ensureLearningJournalTable, list, get, create, update, remove };
