/**
 * Entry point: loads .env, creates the Express app, runs boot-time DB check,
 * then starts listening on the configured PORT.
 */
require('dotenv').config();
const { createApp } = require('./app');
const { ensureReady } = require('./config/db');
const { ensureUsersTable, ensureAuditLogsTable } = require('./services/authService');
const { ensureAuthSessionsTable } = require('./services/authSessionService');
const { ensureStudyGoalsTable, ensureWeeklyCheckinsTable } = require('./services/studyGoalService');
const { ensureNotificationTables } = require('./services/notificationService');
const { ensureModelSnapshotsTable } = require('./services/modelSnapshotService');
const { ensurePredictionEventsTable } = require('./services/predictionHistoryService');
const { ensureStudySessionsTable } = require('./services/studySessionService');
const { ensureStudentAssignmentsTable } = require('./services/assignmentService');

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  const app = createApp();

  // Boot-time DB readiness (so the first page load doesn't wait)
  const dbReady = await ensureReady();
  app.locals.dbReady = dbReady;

  // Auto-create the users table
  try {
    await ensureUsersTable();
    console.log('   Users table: ready');
  } catch (err) {
    console.error('   Users table: FAILED —', err.message);
  }

  // Auto-create the refresh-session table after users (foreign-key dependency)
  try {
    await ensureAuthSessionsTable();
    console.log('   Auth sessions table: ready');
  } catch (err) {
    console.error('   Auth sessions table: FAILED —', err.message);
  }

  // Auto-create the audit_logs table
  try {
    await ensureAuditLogsTable();
    console.log('   Audit logs table: ready');
  } catch (err) {
    console.error('   Audit logs table: FAILED —', err.message);
  }

  // Auto-create the study_goals table
  try {
    await ensureStudyGoalsTable();
    console.log('   Study goals table: ready');
  } catch (err) {
    console.error('   Study goals table: FAILED —', err.message);
  }

  // Auto-create the weekly_checkins table
  try {
    await ensureWeeklyCheckinsTable();
    console.log('   Weekly checkins table: ready');
  } catch (err) {
    console.error('   Weekly checkins table: FAILED —', err.message);
  }

  // Auto-create notification storage after the users table dependency.
  try {
    await ensureNotificationTables();
    console.log('   Notification tables: ready');
  } catch (err) {
    console.error('   Notification tables: FAILED —', err.message);
  }

  // Auto-create ML model snapshots table
  try {
    await ensureModelSnapshotsTable();
    console.log('   ML model snapshots table: ready');
  } catch (err) {
    console.error('   ML model snapshots table: FAILED —', err.message);
  }

  // Auto-create ML prediction events table
  try {
    await ensurePredictionEventsTable();
    console.log('   ML prediction events table: ready');
  } catch (err) {
    console.error('   ML prediction events table: FAILED —', err.message);
  }

  // Auto-create study sessions table
  try {
    await ensureStudySessionsTable();
    console.log('   Study sessions table: ready');
  } catch (err) {
    console.error('   Study sessions table: FAILED —', err.message);
  }

  // Auto-create personal assignments after the students table dependency.
  try {
    await ensureStudentAssignmentsTable();
    console.log('   Student assignments table: ready');
  } catch (err) {
    console.error('   Student assignments table: FAILED —', err.message);
  }

  if (!dbReady) {
    console.warn(
      '\n  Database not ready — the app will start but show an error page.' +
      '\n   Run: npm run import:sample   (or: npm run import -- --file <your.csv> --replace)' +
      '\n'
    );
  }

  const server = app.listen(PORT, () => {
    console.log(` Server running at http://localhost:${PORT}`);
    console.log(`   DB ready: ${dbReady ? 'yes' : 'no'}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${PORT} is already in use.`);
      console.error(`  Another process is listening on this port.`);
      console.error(`  To fix:`);
      console.error(`    1. Find and stop the process using port ${PORT}, or`);
      console.error(`    2. Set a different port via PORT environment variable (e.g., PORT=3002 npm run dev)`);
      console.error(`  Example: lsof -ti:${PORT} | xargs kill -9   (on macOS/Linux)`);
      console.error(`  On Windows, use: netstat -ano | findstr :${PORT} then taskkill /PID <PID> /F`);
    } else {
      console.error('  Server error:', err);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});