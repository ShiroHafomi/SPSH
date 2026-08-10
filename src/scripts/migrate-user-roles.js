/**
 * Migration script: Convert main user account to TEACHER role and link to student record.
 * Run with: node src/scripts/migrate-user-roles.js
 */

require('dotenv').config();
const { pool } = require('../config/db');
const bcrypt = require('bcryptjs');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Convert user "tranp9436@gmail.com" to TEACHER role
    console.log('Converting main user to TEACHER role...');
    const [userRows] = await connection.query(
      'SELECT id, email, name, role, student_id FROM users WHERE email = ?',
      ['tranp9436@gmail.com']
    );

    if (userRows.length === 0) {
      console.log('User tranp9436@gmail.com not found!');
      return;
    }

    const user = userRows[0];
    console.log(`Found user: ${user.email} (id: ${user.id}, current role: ${user.role})`);

    // Update role to teacher
    await connection.query(
      'UPDATE users SET role = ?, department = ? WHERE id = ?',
      ['teacher', 'Computer Science', user.id]
    );
    console.log(`Updated user ${user.email} to TEACHER role`);

    // 2. Link the teacher to a student for demo purposes (admin can do this for students)
    // Let's also create a student user linked to student_id=1001
    console.log('\nCreating a demo STUDENT user linked to student_id=1001...');

    // Check if student user already exists
    const [existingStudentUser] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      ['student@demo.com']
    );

    if (existingStudentUser.length === 0) {
      const passwordHash = await bcrypt.hash('Student123!', 12);
      await connection.query(
        'INSERT INTO users (email, password_hash, name, role, student_id, department) VALUES (?, ?, ?, ?, ?, ?)',
        ['student@demo.com', passwordHash, 'Demo Student', 'student', 1001, 'Computer Science']
      );
      console.log('Created student@demo.com (password: Student123!) linked to student_id=1001');
    } else {
      console.log('Demo student user already exists');
    }

    // 3. Also create a demo admin user if not exists (for admin panel access)
    console.log('\nCreating a demo ADMIN user...');
    const [existingAdminUser] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      ['admin@demo.com']
    );

    if (existingAdminUser.length === 0) {
      const passwordHash = await bcrypt.hash('Admin123!', 12);
      await connection.query(
        'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
        ['admin@demo.com', passwordHash, 'Demo Admin', 'admin']
      );
      console.log('Created admin@demo.com (password: Admin123!) with ADMIN role');
    } else {
      console.log('Demo admin user already exists');
    }

    await connection.commit();
    console.log('\n✅ Migration completed successfully!');
    console.log('\n=== LOGIN CREDENTIALS ===');
    console.log('TEACHER: tranp9436@gmail.com (original password)');
    console.log('STUDENT: student@demo.com / Student123!');
    console.log('ADMIN:   admin@demo.com / Admin123!');

  } catch (error) {
    await connection.rollback();
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));