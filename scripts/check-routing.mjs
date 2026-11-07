import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { AudioBridge } from '../src/bridge.mjs';
const executable = fileURLToPath(new URL('../dist/local.tux.appmixer.sdPlugin/bin/native/AudioBridge.exe', import.meta.url));
const bridge = new AudioBridge(executable, console.error, ['--test-session']);
let own, original, system;
try {
  const deadline = performance.now() + 15000;
  let snapshot;
  while (performance.now() < deadline) {
    snapshot = await bridge.request('list');
    own = snapshot.apps.find(a => a.key === path.resolve(executable).toLowerCase());
    if (own) break;
    await delay(100);
  }
  assert.ok(own); assert.ok(snapshot.outputs.length); assert.equal(snapshot.appRoutingSupported, true, snapshot.routingError);
  system = snapshot.systemOutputId; original = own.policyOutputId;
  // Exercise the actual COM setter only on OUR silent session, to its current system device.
  await bridge.request('set-app-output', { key: own.key, deviceId: system });
  const readback = await bridge.request('list');
  assert.equal(readback.apps.find(a => a.key === own.key)?.policyOutputId, system);
  assert.equal(readback.systemOutputId, system);
  await assert.rejects(bridge.request('set-system-output', { deviceId: 'nonexistent-endpoint' }));
  console.log(`PASS: ${snapshot.outputs.length} outputs enumerated; per-app policy set/readback on OWN silent session; invalid system endpoint rejected. System default and user applications unchanged.`);
} finally {
  try {
    if (own && system) {
      await bridge.request('set-app-output', { key: own.key, deviceId: original ?? null });
      const restored = await bridge.request('list');
      assert.equal(restored.apps.find(a => a.key === own.key)?.policyOutputId ?? null, original ?? null);
      assert.equal(restored.systemOutputId, system);
    }
  } finally { bridge.close(); }
}
