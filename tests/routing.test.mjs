import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller, KEY } from '../src/controller.mjs';
import { SYSTEM_OUTPUT, APP_OUTPUT } from '../src/routing.mjs';

async function fixture({ supported = true } = {}) {
  const calls = [], sent = [];
  const snapshot = { apps: [{ key: 'music', name: 'Music', volume: 50, online: true, policyOutputId: null },
    { key: 'chat', name: 'Chat', volume: 75, online: true, policyOutputId: 'B' }],
  outputs: [{ id: 'A', name: 'Realphones' }, { id: 'B', name: 'MiniFuse' }, { id: 'C', name: 'Broadcast' }],
  systemOutputId: 'A', appRoutingSupported: supported };
  const c = new Controller({ send: message => sent.push(message), audio: { request: async (op, payload) => {
    calls.push({ op, ...payload });
    if (op === 'set-system-output') snapshot.systemOutputId = payload.deviceId;
    if (op === 'set-app-output') snapshot.apps.find(app => app.key === payload.key).policyOutputId = payload.deviceId;
    return snapshot;
  } } });
  c.ingest(snapshot);
  await c.handle({ event: 'didReceiveGlobalSettings', payload: { settings: {} } });
  for (const [action, context, column] of [[KEY, 'key', 0], [SYSTEM_OUTPUT, 'system', 1], [APP_OUTPUT, 'app', 2]])
    await c.handle({ event: 'willAppear', action, context, device: 'dev', payload: { coordinates: { column, row: 0 } } });
  const event = (name, context, payload = {}) => c.handle({ event: name, context, payload });
  return { c, calls, sent, event, snapshot };
}
test('system output browsing never switches sound; click explicitly applies candidate', async () => {
  const f = await fixture();
  await f.event('dialRotate', 'system', { ticks: 1, pressed: false });
  assert.deepEqual(f.calls, []);
  assert.equal(f.c.outputState('system', f.c.actions.get('system')).chosen.id, 'B');
  await f.event('dialDown', 'system'); await f.event('dialUp', 'system');
  assert.deepEqual(f.calls, [{ op: 'set-system-output', deviceId: 'B' }]);
});
test('touch app-output then app key selects its target, click changes only that app', async () => {
  const f = await fixture();
  await f.event('touchTap', 'app', { hold: false });
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.equal(f.c.mixer.device('dev').dials[2].key, 'music');
  await f.event('dialRotate', 'app', { ticks: 2, pressed: false });
  assert.deepEqual(f.calls, []);
  await f.event('dialDown', 'app'); await f.event('dialUp', 'app');
  assert.deepEqual(f.calls, [{ op: 'set-app-output', key: 'music', deviceId: 'B' }]);
});
test('application can return to system default, without changing system default itself', async () => {
  const f = await fixture(); f.c.mixer.device('dev').dials[2].key = 'chat';
  await f.event('sendToPlugin', 'app', { command: 'previewOutput', deviceId: null });
  await f.event('sendToPlugin', 'app', { command: 'applyOutput' });
  assert.deepEqual(f.calls, [{ op: 'set-app-output', key: 'chat', deviceId: null }]);
  assert.equal(f.snapshot.systemOutputId, 'A');
});
test('cancel, paging gestures and unplugged devices never apply a candidate', async () => {
  const f = await fixture();
  await f.event('dialRotate', 'system', { ticks: 1, pressed: false });
  await f.event('touchTap', 'system', { hold: true });
  assert.equal(f.c.outputState('system', f.c.actions.get('system')).pending, false);
  await f.event('dialDown', 'system'); await f.event('dialRotate', 'system', { ticks: 1, pressed: true }); await f.event('dialUp', 'system');
  assert.deepEqual(f.calls, []);
  await f.event('dialRotate', 'system', { ticks: 2, pressed: false });
  f.c.ingest({ ...f.snapshot, outputs: f.snapshot.outputs.filter(d => d.id !== 'C') });
  assert.equal(f.c.outputState('system', f.c.actions.get('system')).pending, false);
});
test('changing application discards the old draft; mid-click changes do not route either app', async () => {
  const f = await fixture(); f.c.mixer.device('dev').dials[2].key = 'music';
  await f.event('dialRotate', 'app', { ticks: 1, pressed: false });
  await f.event('dialDown', 'app');
  f.c.mixer.device('dev').dials[2].key = 'chat';
  await f.event('dialUp', 'app');
  assert.deepEqual(f.calls, []);
  assert.equal(f.c.outputState('app', f.c.actions.get('app')).pending, false);
});
test('unsupported Windows API and offline apps show errors without setting output', async () => {
  const f = await fixture({ supported: false }); f.c.mixer.device('dev').dials[2].key = 'music';
  await f.event('dialDown', 'app'); await f.event('dialUp', 'app');
  assert.deepEqual(f.calls, []); assert.ok(f.sent.some(m => m.event === 'showAlert'));
  const g = await fixture();
  await g.event('dialDown', 'app'); await g.event('dialUp', 'app');
  assert.deepEqual(g.calls, []);
});
test('global-settings echoes do not move selection away from the application output dial', async () => {
  const f = await fixture(); await f.event('touchTap', 'app', { hold: false });
  const settings = JSON.parse(JSON.stringify(f.c.mixer.snapshot()));
  await f.c.handle({ event: 'didReceiveGlobalSettings', payload: { settings } });
  assert.equal(f.c.mixer.device('dev').selected, 2);
});
