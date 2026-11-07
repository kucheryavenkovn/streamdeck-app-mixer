import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { AudioBridge } from '../src/bridge.mjs';
const executable = process.argv[2] ?? fileURLToPath(new URL('../dist/local.tux.appmixer.sdPlugin/bin/native/AudioBridge.exe', import.meta.url));
const bridge = new AudioBridge(executable, console.error, ['--test-session']);
let own;
try {
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    const result = await bridge.request('list');
    own = result.apps.find(a => a.key === executable.toLowerCase().replaceAll('/', '\\'));
    if (own) break;
    await delay(100);
  }
  assert.ok(own, 'Own silent test session must be discovered before measuring');
  const timings = [];
  for (let i = 0; i < 35; i++) {
    const start = performance.now();
    const result = await bridge.request('adjust', { key: own.key, delta: i % 2 ? 10 : -10 });
    timings.push(performance.now() - start);
    assert.equal(result.apps.find(a => a.key === own.key).volume, i % 2 ? own.volume : Math.max(0, own.volume - 10));
    // Span a background discovery/snapshot replacement, not only an idle worker.
    await delay(100);
  }
  const sorted = [...timings].sort((a, b) => a - b);
  const summary = { samples: timings.length, medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(1), p95Ms: +sorted[Math.floor(sorted.length * .95)].toFixed(1), maxMs: +sorted.at(-1).toFixed(1) };
  console.log(JSON.stringify(summary));
  assert.ok(summary.p95Ms < 200, 'Interactive bridge commands must not wait for full discovery');
  const muted = await bridge.request('mute', { key: own.key });
  assert.equal(muted.apps.find(a => a.key === own.key).muted, !own.muted);
  await bridge.request('mute', { key: own.key });
  console.log('PASS: volume/readback/mute on OWN silent session, including background rediscovery. User sessions untouched.');
} finally { bridge.close(); }
