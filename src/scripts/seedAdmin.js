#!/usr/bin/env node
/**
 * Seed / reset the bootstrap admin account.
 *
 * The app disables public self-registration (per the multi-role spec), so the
 * first admin must be provisioned out-of-band. This idempotent script does
 * that safely: it auto-creates the `users` table if needed, refuses to create
 * a duplicate admin, and supports a `--reset` flag to change a forgotten
 * password. It reuses the auth service for hashing + role validation so the
 * credential is identical to one created through the normal API.
 *
 * Usage:
 *   node src/scripts/seedAdmin.js
 *   node src/scripts/seedAdmin.js --email a@b.com --password <secret> --name "Jane"
 *   node src/scripts/seedAdmin.js --reset --password <new-secret>
 *   npm run seed:admin
 *
 * ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME (or matching CLI flags) are
 * mandatory in production. Development retains convenience defaults with an
 * explicit warning. Password values are never written to output.
 *
 * The script never deletes or downgrades an existing admin account; it only
 * inserts a new one or (with --reset) updates the password of the matched
 * existing admin.
 */
require('dotenv').config();
const { pool } = require('../config/db');
const { ensureUsersTable, createUser, updateUser } = require('../services/authService');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEVELOPMENT_DEFAULTS = {
  email: 'admin@school.edu',
  password: 'Admin123!',
  name: 'System Admin',
};
const DEFAULTS = {
  email: process.env.ADMIN_EMAIL || (IS_PRODUCTION ? '' : DEVELOPMENT_DEFAULTS.email),
  password: process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? '' : DEVELOPMENT_DEFAULTS.password),
  name: process.env.ADMIN_NAME || (IS_PRODUCTION ? '' : DEVELOPMENT_DEFAULTS.name),
};

function parseArgs(argv) {
  const opts = { email: DEFAULTS.email, password: DEFAULTS.password, name: DEFAULTS.name, reset: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (['--email', '--password', '--name'].includes(arg)) {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new Error(`${arg} requires a value.`);
      }
      opts[arg.slice(2)] = argv[++i];
    } else if (arg === '--reset') {
      opts.reset = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node src/scripts/seedAdmin.js [--email <email>] [--password <pw>] [--name <name>] [--reset]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function validateOptions(opts) {
  if (IS_PRODUCTION && (!opts.email || !opts.password || !opts.name)) {
    throw new Error(
      'Production seeding requires ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME or matching CLI flags.'
    );
  }
  if (IS_PRODUCTION && opts.password === DEVELOPMENT_DEFAULTS.password) {
    throw new Error('The development fallback password is forbidden in production.');
  }
  if (typeof opts.email !== 'string'
      || opts.email.length > 255
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.email.trim())) {
    throw new Error('A valid admin email is required.');
  }
  if (typeof opts.name !== 'string'
      || opts.name.trim().length < 2
      || opts.name.trim().length > 100) {
    throw new Error('Admin name must be between 2 and 100 characters.');
  }
  if (typeof opts.password !== 'string'
      || opts.password.length < 8
      || !/[A-Z]/.test(opts.password)
      || !/[a-z]/.test(opts.password)
      || !/[0-9]/.test(opts.password)) {
    throw new Error(
      'Admin password must be at least 8 characters and contain uppercase, lowercase, and numeric characters.'
    );
  }
  if (Buffer.byteLength(opts.password, 'utf8') > 72) {
    throw new Error('Admin password cannot exceed 72 UTF-8 bytes.');
  }
  if (!IS_PRODUCTION && opts.password === DEVELOPMENT_DEFAULTS.password) {
    console.warn('\n! Using the predictable development admin password. Set ADMIN_PASSWORD before sharing this environment.');
  }

  opts.email = opts.email.trim().toLowerCase();
  opts.name = opts.name.trim();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  validateOptions(opts);

  // Guarantee the table exists (same as server boot) so this runs even before
  // the app has ever started.
  await ensureUsersTable();

  // Match an existing admin by email OR by role (avoid creating a duplicate).
  const [byEmail] = await pool.query(
    'SELECT id, email, name, role, is_active FROM users WHERE email = ? LIMIT 1',
    [opts.email]
  );
  const [byRole] = await pool.query(
    'SELECT id, email, name, role, is_active FROM users WHERE role = ? ORDER BY id ASC LIMIT 1',
    ['admin']
  );

  const existingByEmail = byEmail[0];
  const existingAdmin = byRole[0];

  if (existingByEmail && existingByEmail.role === 'admin') {
    if (!opts.reset) {
      console.log('\n✓ Admin account already exists (matched by email).');
      console.log(`  id     : ${existingByEmail.id}`);
      console.log(`  email  : ${existingByEmail.email}`);
      console.log(`  name   : ${existingByEmail.name}`);
      console.log(`  active : ${existingByEmail.is_active ? 'yes' : 'no'}`);
      console.log('\nNot modifying it. To reset the password, re-run with --reset --password <newpw>\n');
      return;
    }
    await updateUser(existingByEmail.id, { password: opts.password });
    console.log('\n✓ Admin password reset.');
    console.log(`  email : ${existingByEmail.email}`);
    console.log('  The new password was not printed.');
    console.log('\nLog in at http://localhost:3000/login\n');
    return;
  }

  if (existingAdmin) {
    // An admin exists under a different email. Don't silently create a second one.
    console.log('\n! An admin account already exists under a different email:');
    console.log(`  id     : ${existingAdmin.id}`);
    console.log(`  email  : ${existingAdmin.email}`);
    console.log(`  name   : ${existingAdmin.name}`);
    if (opts.reset) {
      await updateUser(existingAdmin.id, { password: opts.password });
      console.log('\n✓ Password for that admin has been reset.');
      console.log('  The new password was not printed.');
      console.log('\nLog in at http://localhost:3000/login\n');
    } else {
      console.log('\nNot creating a duplicate. To reset that admin\'s password, re-run with --reset --password <newpw>\n');
    }
    return;
  }

  // No admin exists at all — create one.
  const created = await createUser({
    email: opts.email,
    password: opts.password,
    name: opts.name,
    role: 'admin',
  });

  console.log('\n✓ Admin account created.');
  console.log(`  id       : ${created.id}`);
  console.log(`  email    : ${created.email}`);
  console.log(`  name     : ${created.name}`);
  console.log(`  role     : ${created.role}`);
  console.log('  password : configured (not printed)');
  console.log('\nLog in at http://localhost:3000/login');
  console.log('(Change this password after first login via Admin → User Management.)\n');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('\n✗ Failed to seed admin:', err.message || err);
    pool.end().finally(() => process.exit(1));
  });
