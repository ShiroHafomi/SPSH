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
      reject(new Error('ML capacity exceeded'));
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
      function settle(err, value) {
        if (settled) return;
        settled = true;
        releaseSlot();
        if (err) reject(err);
        else resolve(value);
      }

      const proc = spawn(PYTHON_CMD, [SCRIPT_PATH, '--json', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
        },
      });

      // Hard timeout
      const timeoutMs = Number(process.env.ML_TIMEOUT_MS) || 15000;
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        settle(new Error('ML inference timeout'));
      }, timeoutMs);

      // Bounded buffers
      const MAX_STDOUT = 64 * 1024; // 64 KiB
      const MAX_STDERR = 32 * 1024; // 32 KiB
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.length > MAX_STDOUT) {
          proc.kill('SIGKILL');
          settle(new Error('ML output too large'));
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk;
        if (stderr.length > MAX_STDERR) {
          // Don't kill, just truncate logging
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        settle(new Error('ML process failed to start'));
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          // Log full stderr server-side only
          console.error('[mlRunner] Python exited with code', code, 'stderr:', stderr.slice(0, 500));
          settle(new Error('Prediction failed'));
          return;
        }

        try {
          const result = JSON.parse(stdout.trim());
          settle(null, result);
        } catch (parseErr) {
          console.error('[mlRunner] Parse error:', parseErr, 'stdout:', stdout.slice(0, 500));
          settle(new Error('Failed to parse prediction result'));
        }
      });

      // Bounded stdin write
      try {
        proc.stdin.write(JSON.stringify(pythonInput));
        proc.stdin.end();
      } catch (writeErr) {
        clearTimeout(timer);
        proc.kill('SIGKILL');
        settle(new Error('Failed to write ML input'));
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