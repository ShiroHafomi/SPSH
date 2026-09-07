'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const childProcess = require('node:child_process');
const { MlDependencyError } = require('./mlErrors');

async function withRunner(spawn, run) {
  const originalSpawn = childProcess.spawn;
  const timeout = process.env.ML_TIMEOUT_MS;
  childProcess.spawn = spawn;
  process.env.ML_TIMEOUT_MS = '10';
  delete require.cache[require.resolve('./mlRunner')];
  const runner = require('./mlRunner');
  try {
    await run(runner);
    assert.equal(runner.getRunnerStats().active, 0);
  } finally {
    childProcess.spawn = originalSpawn;
    if (timeout === undefined) delete process.env.ML_TIMEOUT_MS;
    else process.env.ML_TIMEOUT_MS = timeout;
    delete require.cache[require.resolve('./mlRunner')];
  }
}

function processDouble(onEnd) {
  const proc = new EventEmitter();
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = () => { queueMicrotask(() => proc.emit('close', null)); return true; };
  proc.stdin.on('finish', () => onEnd(proc));
  return proc;
}

test('runner uses no shell, correct arguments, one process, and parses JSON', async () => {
  let calls = 0;
  await withRunner((command, args, options) => {
    calls++;
    assert.match(args[0], /ml[\\/]inference\.py$/);
    assert.deepEqual(args.slice(1), ['--json', '-']);
    assert.equal(options.shell, false);
    return processDouble(proc => { proc.stdout.write('{"final_score":80}'); proc.emit('close', 0); });
  }, async runner => {
    assert.deepEqual(await runner.runInference({ age: 19 }), { final_score: 80 });
  });
  assert.equal(calls, 1);
});

for (const [label, finish] of [
  ['missing artifacts/nonzero exit', proc => proc.emit('close', 1)],
  ['invalid JSON', proc => { proc.stdout.write('private model data'); proc.emit('close', 0); }],
  ['oversized output', proc => proc.stdout.write('x'.repeat(65537))],
  ['process startup error', proc => proc.emit('error', new Error('/private/python missing'))],
  ['asynchronous broken stdin', proc => proc.stdin.emit('error', new Error('EPIPE'))],
  ['timeout', () => {}],
]) {
  test(`runner classifies ${label} safely and releases its slot`, async () => {
    await withRunner(() => processDouble(finish), async runner => {
      await assert.rejects(runner.runInference({ age: 19 }), error => {
        assert.ok(error instanceof MlDependencyError);
        assert.equal(error.code, 'ML_SERVICE_UNAVAILABLE');
        assert.doesNotMatch(error.message, /private|EPIPE/);
        return true;
      });
    });
  });
}

test('synchronous spawn failure releases its concurrency slot', async () => {
  await withRunner(() => { throw new Error('invalid executable'); }, async runner => {
    await assert.rejects(runner.runInference({ age: 19 }), MlDependencyError);
  });
});
