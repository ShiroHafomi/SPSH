#!/usr/bin/env node
// ============================================================
// Student Performance & Study Habits — Unified Startup Script
// ============================================================
// Cross-platform startup script (works on Windows, macOS, Linux)
// Replaces: start.bat, start.ps1, start.sh
//
// Usage:
//   node start.js              # Start backend in development mode (nodemon)
//   node start.js dev          # Same as above
//   node start.js prod         # Start backend in production mode
//   node start.js ml           # Show ML pipeline commands
//   node start.js import       # Import sample CSV data into MySQL
//   node start.js setup        # Full first-time setup (install + import + train ML)
//   node start.js help         # Show this help
// ============================================================

const { spawnSync, spawn } = require('child_process');
const { existsSync, readFileSync, copyFileSync } = require('fs');
const { resolve } = require('path');

const PROJECT_ROOT = __dirname;

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function colorize(color, ...args) {
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  return useColor ? `${COLORS[color]}${args.join(' ')}${COLORS.reset}` : args.join(' ');
}

const log = {
  info: (...a) => console.log(colorize('blue', '[INFO]', ...a)),
  ok: (...a) => console.log(colorize('green', '[OK]', ...a)),
  warn: (...a) => console.log(colorize('yellow', '[WARN]', ...a)),
  error: (...a) => console.error(colorize('red', '[ERROR]', ...a)),
  plain: (...a) => console.log(...a),
};

function run(cmd, args, options = {}) {
  const fullCmd = process.platform === 'win32' && !options.shell ? `${cmd}.cmd` : cmd;
  const result = spawnSync(fullCmd, args, {
    cwd: PROJECT_ROOT,
    stdio: options.stdio ?? 'inherit',
    shell: options.shell ?? (process.platform === 'win32'),
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  if (result.error) throw result.error;
  return result;
}

function runAsync(cmd, args, options = {}) {
  const fullCmd = process.platform === 'win32' && !options.shell ? `${cmd}.cmd` : cmd;
  return new Promise((resolve, reject) => {
    const child = spawn(fullCmd, args, {
      cwd: PROJECT_ROOT,
      stdio: options.stdio ?? 'inherit',
      shell: options.shell ?? (process.platform === 'win32'),
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)));
  });
}

function checkCmd(name) {
  try {
    run(name, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasEnvFile() {
  return existsSync(resolve(PROJECT_ROOT, '.env'));
}

function ensureEnvFile() {
  if (!hasEnvFile()) {
    const examplePath = resolve(PROJECT_ROOT, '.env.example');
    if (existsSync(examplePath)) {
      copyFileSync(examplePath, resolve(PROJECT_ROOT, '.env'));
      log.info('Created .env from .env.example');
      return true;
    }
  }
  return false;
}

function showHelp() {
  log.plain(`
Usage: node start.js [command]

Commands:
  dev (default)  Start backend in development mode (nodemon)
  prod           Start backend in production mode
  ml             Show ML pipeline commands
  import         Import sample CSV data into MySQL
  setup          Full first-time setup (install + import + train ML)
  help           Show this help

Examples:
  node start.js
  node start.js prod
  node start.js setup
`);
}

function showML() {
  log.plain(`

${colorize('cyan', '============================================================')}
${colorize('cyan', 'ML PIPELINE COMMANDS')}
${colorize('cyan', '============================================================')}

One-time setup:
  pip install -r ml/requirements.txt

Train models (after importing data to MySQL):
  python ml/fetch_data.py
  python ml/train.py

Predict via CLI:
  python ml/inference.py --gender Female --age 19 --study-hours 4.5 --attendance 95 --sleep 8 --gpa 3.8 --parental PhD --internet-access Yes --extracurricular Yes --part-time-job No

Predict via JSON file:
  python ml/inference.py --json ml/student_example.json

Predict via stdin (for API integration):
  echo '{"gender":"Female",...}' | python ml/inference.py --json -

What-if analysis:
  python ml/inference.py --gender Male --age 18 --study-hours 2 --attendance 75 --gpa 2.8 --what-if study_hours_per_day 4.0

Retrain after adding new data:
  python ml/fetch_data.py && python ml/train.py

API endpoint (requires auth session):
  POST http://localhost:3000/api/predict
`);
}

async function doImport() {
  log.info('Importing sample data...');
  if (!hasEnvFile()) {
    log.warn('.env not found. Copying from .env.example...');
    ensureEnvFile();
    log.warn('Please edit .env with your MySQL password, then re-run.');
    process.exit(1);
  }
  run('npm', ['run', 'import:sample']);
  log.ok('Import complete. schema_map.json generated.');
}

async function doSetup() {
  log.info('Full first-time setup...');

  log.info('[1/5] Checking prerequisites...');
  const checks = ['node', 'npm'];
  if (process.platform !== 'win32') checks.push('python3');
  else checks.push('python');
  for (const cmd of checks) {
    if (!checkCmd(cmd)) {
      log.error(`${cmd} not found in PATH`);
      process.exit(1);
    }
  }
  log.ok('Prerequisites found.');

  log.info('[2/5] Installing Node dependencies...');
  run('npm', ['install']);

  log.info('[3/5] Setting up environment...');
  if (!hasEnvFile()) {
    ensureEnvFile();
    log.warn('Edit .env with your MySQL password, then press Enter to continue...');
    await new Promise(r => process.stdin.once('data', r));
  }

  log.info('[4/5] Importing sample data...');
  run('npm', ['run', 'import:sample']);

  log.info('[5/5] Setting up ML pipeline...');
  if (existsSync(resolve(PROJECT_ROOT, 'ml/requirements.txt'))) {
    log.info('Installing Python ML dependencies...');
    try { run('pip', ['install', '-r', 'ml/requirements.txt']); }
    catch { log.warn('pip install had issues, continuing...'); }

    log.info('Fetching training data from MySQL...');
    try { run('python', ['ml/fetch_data.py']); }
    catch { log.warn('fetch_data.py failed, continuing...'); }

    log.info('Training ML models...');
    try { run('python', ['ml/train.py']); }
    catch { log.warn('train.py failed, continuing...'); }
  } else {
    log.warn('ml/requirements.txt not found, skipping ML setup');
  }

  log.ok('SETUP COMPLETE!');
  log.plain(`
Next steps:
  node start.js        # Start dev server (nodemon)
  node start.js prod   # Start production server
  node start.js ml     # Show ML commands
`);
}

async function doStartDev() {
  if (!hasEnvFile()) {
    log.error('.env not found. Run \'node start.js setup\' first.');
    process.exit(1);
  }
  log.info('Starting development server (nodemon)...');
  log.info('Server will be at: http://localhost:3000');
  log.info('Press Ctrl+C to stop.');
  await runAsync('npm', ['run', 'dev']);
}

async function doStartProd() {
  if (!hasEnvFile()) {
    log.error('.env not found. Run \'node start.js setup\' first.');
    process.exit(1);
  }
  log.info('Starting production server...');
  log.info('Server will be at: http://localhost:3000');
  log.info('Press Ctrl+C to stop.');
  await runAsync('npm', ['start']);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const cmd = process.argv[2] || 'dev';

  try {
    switch (cmd) {
      case 'dev':
        await doStartDev();
        break;
      case 'prod':
        await doStartProd();
        break;
      case 'ml':
        showML();
        break;
      case 'import':
        await doImport();
        break;
      case 'setup':
        await doSetup();
        break;
      case 'help':
      case '-h':
      case '--help':
        showHelp();
        break;
      default:
        log.error(`Unknown command: ${cmd}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    if (err.message?.includes('Exit code')) {
      process.exit(1);
    }
    log.error(err.message || err);
    process.exit(1);
  }
}

main();