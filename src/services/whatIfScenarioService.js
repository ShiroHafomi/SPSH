'use strict';

/**
 * What-If Scenario Service — Manage saved What-If simulations for authenticated users.
 * All SQL lives here. Parameterized queries only.
 */
const { pool } = require('../config/db');

const TABLE = 'what_if_scenarios';

/**
 * Ensure the what_if_scenarios table exists with proper schema and constraints.
 * Call this during server startup.
 */
async function ensureWhatIfScenariosTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      owner_user_id INT UNSIGNED NOT NULL,
      student_id INT UNSIGNED NULL,
      baseline_event_id INT UNSIGNED NULL,
      simulation_event_id INT UNSIGNED NULL,
      scenario_name VARCHAR(80) NOT NULL,
      is_preferred TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_owner_user (owner_user_id, created_at),
      INDEX idx_student (student_id, created_at),
      INDEX idx_preferred (is_preferred, owner_user_id, student_id),
      CONSTRAINT fk_wifscenarios_owner
        FOREIGN KEY (owner_user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_wifscenarios_student
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON DELETE SET NULL,
      CONSTRAINT fk_wifscenarios_baseline_event
        FOREIGN KEY (baseline_event_id) REFERENCES ml_prediction_events(id)
        ON DELETE SET NULL,
      CONSTRAINT fk_wifscenarios_simulation_event
        FOREIGN KEY (simulation_event_id) REFERENCES ml_prediction_events(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Validate scenario name.
 * @param {string} name - Scenario name to validate
 * @returns {string} Trimmed name
 * @throws {Error} If name is invalid
 */
function validateScenarioName(name) {
  if (typeof name !== 'string' || !name || !(name = name.trim())) {
    throw new Error('Scenario name is required');
  }
  if (name.length > 80) {
    throw new Error('Scenario name must not exceed 80 characters');
  }
  return name;
}

/**
 * Create a new saved What-If scenario.
 * @param {Object} params - { ownerUserId, studentId, baselineEventId, simulationEventId, scenarioName }
 * @returns {Promise<Object>} Created scenario with id
 */
async function createScenario(params) {
  const {
    ownerUserId,
    studentId,
    baselineEventId,
    simulationEventId,
    scenarioName,
  } = params;

  // Validate inputs
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
    throw new Error('Owner user ID must be a positive safe integer');
  }

  // Student ID can be null, but if provided must be valid
  if (studentId !== null && studentId !== undefined) {
    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      throw new Error('Student ID must be a positive safe integer or null');
    }
  } else {
    studentId = null;
  }

  // Event IDs can be null, but if provided must be valid
  if (baselineEventId !== null && baselineEventId !== undefined) {
    if (!Number.isSafeInteger(baselineEventId) || baselineEventId <= 0) {
      throw new Error('Baseline event ID must be a positive safe integer or null');
    }
  } else {
    baselineEventId = null;
  }

  if (simulationEventId !== null && simulationEventId !== undefined) {
    if (!Number.isSafeInteger(simulationEventId) || simulationEventId <= 0) {
      throw new Error('Simulation event ID must be a positive safe integer or null');
    }
  } else {
    simulationEventId = null;
  }

  const name = validateScenarioName(scenarioName);

  const [result] = await pool.query(
    `
    INSERT INTO ${TABLE}
      (owner_user_id, student_id, baseline_event_id, simulation_event_id, scenario_name)
    VALUES (?, ?, ?, ?, ?)
    `,
    [ownerUserId, studentId, baselineEventId, simulationEventId, name]
  );

  if (!Number.isSafeInteger(result.insertId) || result.insertId <= 0) {
    throw new Error('Failed to create scenario');
  }

  return {
    id: result.insertId,
    ownerUserId,
    studentId: studentId ?? null,
    baselineEventId: baselineEventId ?? null,
    simulationEventId: simulationEventId ?? null,
    scenarioName: name,
    isPreferred: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * List scenarios for a user with optional filtering and pagination.
 * @param {Object} filters - { ownerUserId, studentId, preferredOnly, page, size }
 * @returns {Promise<Object>} Paginated list of scenarios
 */
async function listScenarios(filters) {
  const {
    ownerUserId,
    studentId = null,
    preferredOnly = false,
    page = 1,
    size = 20,
  } = filters || {};

  // Validate inputs
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
    throw new Error('Owner user ID must be a positive safe integer');
  }

  if (studentId !== null && studentId !== undefined) {
    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      throw new Error('Student ID must be a positive safe integer or null');
    }
  } else {
    studentId = null;
  }

  if (!Number.isSafeInteger(page) || page <= 0) {
    throw new Error('Page must be a positive integer');
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error('Size must be a positive integer');
  }
  if (size > 100) {
    throw new Error('Size must not exceed 100');
  }

  const offset = (page - 1) * size;

  // Build WHERE clause
  const whereConditions = ['owner_user_id = ?'];
  const queryParams = [ownerUserId];

  if (studentId !== null) {
    whereConditions.push('student_id = ?');
    queryParams.push(studentId);
  }

  if (preferredOnly) {
    whereConditions.push('is_preferred = 1');
  }

  const whereClause = whereConditions.length > 0
    ? 'WHERE ' + whereConditions.join(' AND ')
    : '';

  // Get total count
  const [[countResult]] = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM ${TABLE}
    ${whereClause}
    `,
    queryParams
  );

  const total = Number.isSafeInteger(countResult.total) ? countResult.total : 0;

  // Get scenarios
  const [rows] = await pool.query(
    `
    SELECT
      id,
      owner_user_id,
      student_id,
      baseline_event_id,
      simulation_event_id,
      scenario_name,
      is_preferred,
      created_at,
      updated_at
    FROM ${TABLE}
    ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
    `,
    [...queryParams, size, offset]
  );

  // Normalize rows
  const scenarios = rows.map(row => ({
    id: Number(row.id),
    ownerUserId: Number(row.owner_user_id),
    studentId: row.student_id !== null ? Number(row.student_id) : null,
    baselineEventId: row.baseline_event_id !== null ? Number(row.baseline_event_id) : null,
    simulationEventId: row.simulation_event_id !== null ? Number(row.simulation_event_id) : null,
    scenarioName: row.scenario_name,
    isPreferred: row.is_preferred === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));

  return {
    scenarios,
    pagination: {
      page,
      size,
      total,
      totalPages: Math.ceil(total / size),
    },
  };
}

/**
 * Update a scenario's name.
 * @param {Object} params - { scenarioId, ownerUserId, scenarioName }
 * @returns {Promise<Object>} Updated scenario
 */
async function updateScenarioName(params) {
  const { scenarioId, ownerUserId, scenarioName } = params;

  // Validate inputs
  if (!Number.isSafeInteger(scenarioId) || scenarioId <= 0) {
    throw new Error('Scenario ID must be a positive safe integer');
  }
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
    throw new Error('Owner user ID must be a positive safe integer');
  }
  const name = validateScenarioName(scenarioName);

  // Verify ownership and update
  const [result] = await pool.query(
    `
    UPDATE ${TABLE}
    SET scenario_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND owner_user_id = ?
    `,
    [name, scenarioId, ownerUserId]
  );

  if (result.affectedRows === 0) {
    throw new Error('Scenario not found or access denied');
  }

  // Get updated scenario
  const [rows] = await pool.query(
    `
    SELECT
      id,
      owner_user_id,
      student_id,
      baseline_event_id,
      simulation_event_id,
      scenario_name,
      is_preferred,
      created_at,
      updated_at
    FROM ${TABLE}
    WHERE id = ?
    `,
    [scenarioId]
  );

  if (rows.length === 0) {
    throw new Error('Scenario not found after update');
  }

  const row = rows[0];
  return {
    id: Number(row.id),
    ownerUserId: Number(row.owner_user_id),
    studentId: row.student_id !== null ? Number(row.student_id) : null,
    baselineEventId: row.baseline_event_id !== null ? Number(row.baseline_event_id) : null,
    simulationEventId: row.simulation_event_id !== null ? Number(row.simulation_event_id) : null,
    scenarioName: row.scenario_name,
    isPreferred: row.is_preferred === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Mark a scenario as preferred for its owner and student.
 * Ensures only one preferred scenario per user-student combination.
 * @param {Object} params - { scenarioId, ownerUserId }
 * @returns {Promise<Object>} Updated scenario
 */
async function setPreferredScenario(params) {
  const { scenarioId, ownerUserId } = params;

  // Validate inputs
  if (!Number.isSafeInteger(scenarioId) || scenarioId <= 0) {
    throw new Error('Scenario ID must be a positive safe integer');
  }
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
    throw new Error('Owner user ID must be a positive safe integer');
  }

  // Start transaction to ensure atomicity
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get the scenario to verify ownership and get student_id
    const [scenarioRows] = await connection.query(
      `
      SELECT id, student_id
      FROM ${TABLE}
      WHERE id = ? AND owner_user_id = ?
      `,
      [scenarioId, ownerUserId]
    );

    if (scenarioRows.length === 0) {
      await connection.rollback();
      throw new Error('Scenario not found or access denied');
    }

    const studentId = scenarioRows[0].student_id;

    // Clear any existing preferred scenario for this user-student combination
    if (studentId !== null) {
      await connection.query(
        `
        UPDATE ${TABLE}
        SET is_preferred = 0
        WHERE owner_user_id = ? AND student_id = ? AND id != ?
        `,
        [ownerUserId, studentId, scenarioId]
      );
    } else {
      // For null student_id, clear preferences for this owner only
      await connection.query(
        `
        UPDATE ${TABLE}
        SET is_preferred = 0
        WHERE owner_user_id = ? AND student_id IS NULL AND id != ?
        `,
        [ownerUserId, scenarioId]
      );
    }

    // Mark this scenario as preferred
    const [result] = await connection.query(
      `
      UPDATE ${TABLE}
      SET is_preferred = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_user_id = ?
      `,
      [scenarioId, ownerUserId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      throw new Error('Failed to mark scenario as preferred');
    }

    await connection.commit();

    // Get updated scenario
    const [rows] = await connection.query(
      `
      SELECT
        id,
        owner_user_id,
        student_id,
        baseline_event_id,
        simulation_event_id,
        scenario_name,
        is_preferred,
        created_at,
        updated_at
      FROM ${TABLE}
      WHERE id = ?
      `,
      [scenarioId]
    );

    if (rows.length === 0) {
      throw new Error('Scenario not found after update');
    }

    const row = rows[0];
    return {
      id: Number(row.id),
      ownerUserId: Number(row.owner_user_id),
      studentId: row.student_id !== null ? Number(row.student_id) : null,
      baselineEventId: row.baseline_event_id !== null ? Number(row.baseline_event_id) : null,
      simulationEventId: row.simulation_event_id !== null ? Number(row.simulation_event_id) : null,
      scenarioName: row.scenario_name,
      isPreferred: row.is_preferred === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Delete a scenario.
 * @param {Object} params - { scenarioId, ownerUserId }
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteScenario(params) {
  const { scenarioId, ownerUserId } = params;

  // Validate inputs
  if (!Number.isSafeInteger(scenarioId) || scenarioId <= 0) {
    throw new Error('Scenario ID must be a positive safe integer');
  }
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
    throw new Error('Owner user ID must be a positive safe integer');
  }

  const [result] = await pool.query(
    `
    DELETE FROM ${TABLE}
    WHERE id = ? AND owner_user_id = ?
    `,
    [scenarioId, ownerUserId]
  );

  return result.affectedRows > 0;
}

/**
 * Get scenario comparison data for two scenarios.
 * @param {Object} params - { scenarioIdA, scenarioIdB, ownerUserId }
 * @returns {Promise<Object>} Comparison data
 */
async function getComparison(params) {
  const { scenarioIdA, scenarioIdB, ownerUserId } = params;

  // Validate inputs
  if (!Number.isSafeInteger(scenarioIdA) || scenarioIdA <= 0) {
    throw new Error('Scenario ID A must be a positive safe integer');
  }
  if (!Number.isSafeInteger(scenarioIdB) || scenarioIdB <= 0) {
    throw new Error('Scenario ID B must be a positive safe integer');
  }
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
    throw new Error('Owner user ID must be a positive safe integer');
  }
  if (scenarioIdA === scenarioIdB) {
    throw new Error('Scenario IDs must be different');
  }

  // Fetch both scenarios with ownership check
  const [rows] = await pool.query(
    `
    SELECT
      id,
      owner_user_id,
      student_id,
      baseline_event_id,
      simulation_event_id,
      scenario_name,
      is_preferred,
      created_at
    FROM ${TABLE}
    WHERE id IN (?, ?) AND owner_user_id = ?
    ORDER BY FIELD(id, ?, ?)
    `,
    [scenarioIdA, scenarioIdB, ownerUserId, scenarioIdA, scenarioIdB]
  );

  if (rows.length !== 2) {
    throw new Error('One or both scenarios not found or access denied');
  }

  // Normalize scenarios
  const scenarios = rows.map(row => ({
    id: Number(row.id),
    ownerUserId: Number(row.owner_user_id),
    studentId: row.student_id !== null ? Number(row.student_id) : null,
    baselineEventId: row.baseline_event_id !== null ? Number(row.baseline_event_id) : null,
    simulationEventId: row.simulation_event_id !== null ? Number(row.simulation_event_id) : null,
    scenarioName: row.scenario_name,
    isPreferred: row.is_preferred === 1,
    createdAt: new Date(row.created_at),
  }));

  // Fetch prediction events for both scenarios
  const eventIds = [];
  scenarios.forEach(scenario => {
    if (scenario.baselineEventId) eventIds.push(scenario.baselineEventId);
    if (scenario.simulationEventId) eventIds.push(scenario.simulationEventId);
  });

  let events = [];
  if (eventIds.length > 0) {
    const placeholders = eventIds.map(() => '?').join(',');
    const [eventRows] = await pool.query(
      `
      SELECT
        id,
        predicted_score,
        predicted_grade,
        grade_confidence,
        study_hours,
        attendance_percent,
        sleep_hours,
        previous_gpa,
        model_version
      FROM ml_prediction_events e
      INNER JOIN ml_model_snapshots s ON s.id = e.model_snapshot_id
      WHERE e.id IN (${placeholders})
      `,
      eventIds
    );

    events = eventRows.map(row => ({
      id: Number(row.id),
      predictedScore: Number(row.predicted_score),
      predictedGrade: row.predicted_grade,
      gradeConfidence: Number(row.grade_confidence),
      studyHours: row.study_hours !== null ? Number(row.study_hours) : null,
      attendancePercent: row.attendance_percent !== null ? Number(row.attendance_percent) : null,
      sleepHours: row.sleep_hours !== null ? Number(row.sleep_hours) : null,
      previousGpa: row.previous_gpa !== null ? Number(row.previous_gpa) : null,
      modelVersion: row.model_version,
    }));
  }

  // Map events back to scenarios
  const eventsById = {};
  events.forEach(event => {
    eventsById[event.id] = event;
  });

  scenarios.forEach(scenario => {
    scenario.baselineEvent = scenario.baselineEventId
      ? eventsById[scenario.baselineEventId] || null
      : null;
    scenario.simulationEvent = scenario.simulationEventId
      ? eventsById[scenario.simulationEventId] || null
      : null;
  });

  return {
    scenarioA: scenarios[0],
    scenarioB: scenarios[1],
  };
}

module.exports = {
  ensureWhatIfScenariosTable,
  validateScenarioName,
  createScenario,
  listScenarios,
  updateScenarioName,
  setPreferredScenario,
  deleteScenario,
  getComparison,
};