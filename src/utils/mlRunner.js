'use strict';

/**
 * Unified ML Python Runner
 * - Single no-shell subprocess with hard bounds
 * - Global concurrency cap with fail-fast 503
 * - Bounded stdin/stdout/stderr, single-settlement cleanup
 * - No Python stderr, paths, or exception text in client responses
 */

const { spawn } = require('child_process');
const path = require('path');
const { MlDependencyError } = require('./mlErrors');

const SCRIPT_PATH = path.join(__dirname, '..', '..', 'ml', 'inference.py');
const PYTHON_CMD = process.env.ML_PYTHON_CMD || 'py';

// Concurrency cap (process-local)
const MAX_CONCURRENT = Math.max(1, Math.min(10, Number(process.env.ML_MAX_CONCURRENT) || 2));
let activeCount = 0;
const waitingQueue = [];

function acquireSlot() {
  return new Promise((resolve, reject) => {
    if (activeCount < MAX_CONCURRENT) {
      activeCount++;
      resolve();
    } else if (waitingQueue.length < 50) {
      waitingQueue.push({ resolve, reject });
    } else {
      reject(new MlDependencyError('ML capacity exceeded'));
    }
  });
}

function releaseSlot() {
  activeCount--;
  if (waitingQueue.length > 0) {
    activeCount++;
    const next = waitingQueue.shift();
    next.resolve();
  }
}

/**
 * Run ML inference with strict bounds.
 * @param {Object} pythonInput - Validated, Python-ready input (already normalized to 0/1)
 * @returns {Promise<Object>} - Parsed JSON result
 */
function runInference(pythonInput) {
  return acquireSlot().then(() => {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      function settle(err, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        releaseSlot();
        if (err) reject(err);
        else resolve(value);
      }

      let proc;
      try {
        proc = spawn(PYTHON_CMD, [SCRIPT_PATH, '--json', '-'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1',
          },
        });
      } catch (error) {
        settle(new MlDependencyError('ML process failed to start'));
        return;
      }

      // Hard timeout
      const timeoutMs = Number(process.env.ML_TIMEOUT_MS) || 15000;
      timer = setTimeout(() => {
        proc.kill('SIGKILL');
        settle(new MlDependencyError('ML inference timeout'));
      }, timeoutMs);

      // Bounded buffers
      const MAX_STDOUT = 64 * 1024; // 64 KiB
      let stdout = '';
      proc.stdout.setEncoding('utf8');

      proc.stdout.on('data', (chunk) => {
        if (settled) return;
        stdout += chunk;
        if (stdout.length > MAX_STDOUT) {
          proc.kill('SIGKILL');
          settle(new MlDependencyError('ML output too large'));
        }
      });

      // Python diagnostics can contain input data and local paths; drain without retaining them.
      proc.stderr.resume();
      proc.stdin.on('error', () => {
        proc.kill('SIGKILL');
        settle(new MlDependencyError('Failed to write ML input'));
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        settle(new MlDependencyError('ML process failed to start'));
      });

      proc.on('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          console.error('[mlRunner] Python exited with code', code);
          settle(new MlDependencyError('Prediction failed'));
          return;
        }

        try {
          const result = JSON.parse(stdout.trim());
          settle(null, result);
        } catch (parseErr) {
          console.error('[mlRunner] Invalid prediction JSON');
          settle(new MlDependencyError('Failed to parse prediction result'));
        }
      });

      // Bounded stdin write
      try {
        proc.stdin.write(JSON.stringify(pythonInput));
        proc.stdin.end();
      } catch (writeErr) {
        clearTimeout(timer);
        proc.kill('SIGKILL');
        settle(new MlDependencyError('Failed to write ML input'));
      }
    });
  });
}

/**
 * Get current runner stats for health checks.
 */
function getRunnerStats() {
  return {
    active: activeCount,
    queued: waitingQueue.length,
    maxConcurrent: MAX_CONCURRENT,
  };
}

module.exports = {
  runInference,
  getRunnerStats,
};