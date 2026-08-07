/**
 * Entry point: loads .env, creates the Express app, runs boot-time DB check,
 * then starts listening on the configured PORT.
 */
require('dotenv').config();
const { createApp } = require('./app');
const { ensureReady } = require('./config/db');
const { ensureUsersTable } = require('./services/authService');

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

  if (!dbReady) {
    console.warn(
      '\n  Database not ready — the app will start but show an error page.' +
      '\n   Run: npm run import:sample   (or: npm run import -- --file <your.csv> --replace)' +
      '\n'
    );
  }

  app.listen(PORT, () => {
    console.log(` Server running at http://localhost:${PORT}`);
    console.log(`   DB ready: ${dbReady ? 'yes' : 'no'}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});