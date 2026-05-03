/**
 * tests/test-runner.js
 * Minimal test harness for the Ads Guru extension.
 * Run: node --experimental-vm-modules tests/test-runner.js
 */
import { performance } from 'perf_hooks';

let passed = 0;
let failed = 0;

export function describe(name, fn) {
  console.log('\n\x1b[36m▶ ' + name + '\x1b[0m');
  fn();
}

export function it(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result.then(() => {
        passed++;
        console.log('  \x1b[32m✓\x1b[0m ' + name);
      }).catch((err) => {
        failed++;
        console.log('  \x1b[31m✗\x1b[0m ' + name);
        console.error('    ', err.message);
      });
    } else {
      passed++;
      console.log('  \x1b[32m✓\x1b[0m ' + name);
    }
  } catch (err) {
    failed++;
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.error('    ', err.message);
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error('Assertion failed: ' + (message || 'no message'));
}

export function assertEquals(a, b, message) {
  if (a !== b) {
    throw new Error((message || 'assertEquals') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }
}

export function benchmark(name, fn, iterations = 10000) {
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn(i);
  const elapsed = performance.now() - t0;
  const opsPerSec = Math.round(iterations / (elapsed / 1000));
  console.log('  \x1b[33m⏱\x1b[0m ' + name + ': ' + opsPerSec.toLocaleString() + ' ops/sec (' + elapsed.toFixed(1) + 'ms / ' + iterations + ' iters)');
  return { opsPerSec, elapsed };
}

process.on('exit', () => {
  console.log('\n' + '─'.repeat(50));
  console.log('Results: \x1b[32m' + passed + ' passed\x1b[0m, \x1b[31m' + failed + ' failed\x1b[0m');
  if (failed > 0) process.exitCode = 1;
});
