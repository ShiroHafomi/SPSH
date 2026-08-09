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
 *   node src/scripts/seedAdmin.js                          # create admin with defaults
 *   node src/scripts/seedAdmin.js --email a@b.com --password secret --name "Jane"
 *   node src/scripts/seedAdmin.js --reset --password NewPass!   # reset existing admin's password
 *   npm run seed:admin                                      # via package script
 *
 * Defaults (overridable by flag or ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME env):
 *   email    = admin@school.edu
 *   password = Admin123!
 *   name     = System Admin
 *
 * The script never deletes or downgrades an existing admin account; it only
 * inserts a new one or (with --reset) updates the password of the matched
 * existing admin.
 */
require('dotenv').config();
const { pool } = require('../config/db');
const { ensureUsersTable, createUser, updateUser } = require('../services/authService');

const DEFAULTS = {
  email: process.env.ADMIN_EMAIL || 'admin@school.edu',
  password: process.env.ADMIN_PASSWORD || 'Admin123!',
  name: process.env.ADMIN_NAME || 'System Admin',
};

function parseArgs(argv) {
  const opts = { email: DEFAULTS.email, password: DEFAULTS.password, name: DEFAULTS.name, reset: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' && i + 1 < argv.length) opts.email = argv[++i];
    else if (a === '--password' && i + 1 < argv.length) opts.password = argv[++i];
    else if (a === '--name' && i + 1 < argv.length) opts.name = argv[++i];
    else if (a === '--reset') opts.reset = true;
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node src/scripts/seedAdmin.js [--email <email>] [--password <pw>] [--name <name>] [--reset]`);
      process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

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
    console.log(`  email    : ${existingByEmail.email}`);
    console.log(`  password : ${opts.password}`);
    console.log('\nLog in at http://localhost:3000/#/login\n');
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
      console.log(`\n✓ Password for that admin has been reset to: ${opts.password}`);
      console.log('\nLog in at http://localhost:3000/#/login\n');
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
  console.log(`  password : ${opts.password}`);
  console.log('\nLog in at http://localhost:3000/#/login');
  console.log('(Change this password after first login via Admin → User Management.)\n');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('\n✗ Failed to seed admin:', err.message || err);
    pool.end().finally(() => process.exit(1));
  });
