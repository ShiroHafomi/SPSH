const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost', port: 3306, user: 'root', password: 'Phuoc123!',
  database: 'student_performance', connectionLimit: 5
});

async function test() {
  // Check current count
  let [rows] = await pool.query('SELECT COUNT(*) as cnt FROM students');
  console.log('Before:', rows[0].cnt);

  // Insert a test row
  await pool.query('INSERT INTO students (student_id, gender, age, study_hours_per_day, attendance_percent, sleep_hours, previous_gpa, parental_education, internet_access, extracurricular, part_time_job, final_score, grade, notes) VALUES (9999, "Test", 20, 4.0, 90, 8.0, 3.5, "Bachelor", 1, 1, 0, 95, "A", "Test")');
  console.log('Inserted test row');

  // Check count again
  [rows] = await pool.query('SELECT COUNT(*) as cnt FROM students');
  console.log('After:', rows[0].cnt);

  // Check if row exists
  [rows] = await pool.query('SELECT * FROM students WHERE student_id = 9999');
  console.log('Test row:', rows[0]);

  await pool.end();
}

test().catch(console.error);