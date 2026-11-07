import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller, KEY, DIAL } from '../src/controller.mjs';
const apps = Array.from({ length: 18 }, (_, i) => ({ key: `a${i}`, name: `App ${i}`, volume: 50, online: true }));
async function fixture() {
  const sent = [], calls = []; let time = 0;
  const controller = new Controller({ send: m => sent.push(m), now: () => time, audio: { request: async (op, payload) => { calls.push({ op, ...payload }); return { apps }; } } });
  controller.uuid = 'registration';
  controller.ingest({ apps });
  await controller.handle({ event: 'didReceiveGlobalSettings', payload: { settings: {} } });
  const event = (name, context, payload = {}) => controller.handle({ event: name, context, payload });
  await controller.handle({ event: 'willAppear', action: KEY, context: 'key', device: 'dev', payload: { coordinates: { column: 0, row: 0 } } });
  await controller.handle({ event: 'willAppear', action: DIAL, context: 'dial', device: 'dev', payload: { coordinates: { column: 0, row: 0 } } });
  return { controller, sent, calls, event, advance: n => { time += n; } };
}
test('short key press assigns application, renders icon and dial feedback', async () => {
  const f = await fixture(); await f.event('keyDown', 'key'); f.advance(100); await f.event('keyUp', 'key');
  assert.equal(f.controller.mixer.device('dev').dials[0].key, 'a0');
  assert.ok(f.sent.some(m => m.event === 'setImage' && m.payload.image.startsWith('data:image/svg+xml;base64,')));
  assert.ok(f.sent.some(m => m.event === 'setFeedback' && m.payload.canvas));
  assert.ok(f.sent.some(m => m.event === 'setGlobalSettings' && m.context === 'registration'));
});
test('long key press pins instead of assigning', async () => {
  const f = await fixture(); await f.event('keyDown', 'key'); f.advance(700); await f.event('keyUp', 'key');
  assert.deepEqual(f.controller.mixer.device('dev').pins, ['a0']); assert.equal(f.controller.mixer.device('dev').dials[0].key, null);
});
test('pressed rotation pages without mute or volume changes', async () => {
  const f = await fixture(); f.controller.mixer.assign('dev', 'a0');
  await f.event('dialDown', 'dial'); await f.event('dialRotate', 'dial', { pressed: true, ticks: 4 }); await f.event('dialUp', 'dial');
  assert.equal(f.controller.mixer.page('dev').index, 1); assert.deepEqual(f.calls, []);
  assert.equal(f.controller.mixer.device('dev').dials[0].key, 'a0');
});
test('unpressed rotation defaults to ten percent per tick', async () => {
  const f = await fixture(); f.controller.mixer.assign('dev', 'a0');
  await f.event('dialRotate', 'dial', { ticks: -3, pressed: false });
  assert.deepEqual(f.calls, [{ op: 'adjust', key: 'a0', delta: -30 }]);
});
test('an explicitly saved step is preserved instead of replaced by default', async () => {
  const f = await fixture(); f.controller.mixer.assign('dev', 'a0');
  await f.event('didReceiveSettings', 'dial', { settings: { step: 2 } });
  await f.event('dialRotate', 'dial', { ticks: 3, pressed: false });
  assert.deepEqual(f.calls, [{ op: 'adjust', key: 'a0', delta: 6 }]);
});
test('dial click mutes; hold touch locks and touch selects channel', async () => {
  const f = await fixture(); f.controller.mixer.assign('dev', 'a2');
  await f.event('dialDown', 'dial'); await f.event('dialUp', 'dial');
  assert.deepEqual(f.calls, [{ op: 'mute', key: 'a2' }]);
  await f.event('touchTap', 'dial', { hold: true });
  assert.equal(f.controller.mixer.device('dev').dials[0].locked, true);
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.equal(f.controller.mixer.device('dev').dials[0].key, 'a2'); assert.ok(f.sent.some(m => m.event === 'showAlert'));
});
test('keyUp targets captured application, not a newly paged slot', async () => {
  const f = await fixture(); await f.event('keyDown', 'key'); f.controller.mixer.turnPage('dev', 1); await f.event('keyUp', 'key');
  assert.equal(f.controller.mixer.device('dev').dials[0].key, 'a0');
});
test('unchanged snapshots do not resend images', async () => {
  const f = await fixture(); const count = f.sent.length; f.controller.ingest({ apps }); assert.equal(f.sent.length, count);
});
test('initial events do not overwrite saved global settings', async () => {
  const sent = [], c = new Controller({ send: m => sent.push(m), audio: {} });
  await c.handle({ event: 'willAppear', action: KEY, context: 'k', device: 'dev', payload: { coordinates: { column: 0, row: 0 } } });
  await c.handle({ event: 'keyDown', context: 'k' }); await c.handle({ event: 'keyUp', context: 'k' });
  assert.equal(sent.filter(m => m.event === 'setGlobalSettings').length, 0);
});
test('audio error shows offline state and recovers on next successful scan', async () => {
  const f = await fixture(); f.controller.mixer.assign('dev', 'a0');
  f.controller.audio.request = async () => { throw new Error('unavailable'); };
  await f.controller.refresh(); assert.equal(f.controller.error, 'unavailable'); assert.equal(f.controller.mixer.app('a0').online, false);
  f.controller.audio.request = async () => ({ apps }); await f.controller.refresh(); assert.equal(f.controller.error, null);
});
test('offline dial never sends a volume command', async () => {
  const f = await fixture(); f.controller.mixer.assign('dev', 'a0'); f.controller.mixer.update([]);
  await f.event('dialRotate', 'dial', { ticks: 1, pressed: false }); assert.deepEqual(f.calls, []);
});
test('settings and assignments survive action context replacement', async () => {
  const f = await fixture(); f.controller.mixer.assign('dev', 'a5');
  await f.event('willDisappear', 'dial');
  await f.controller.handle({ event: 'willAppear', action: DIAL, context: 'new', device: 'dev', payload: { coordinates: { column: 0, row: 0 } } });
  assert.equal(f.controller.appFor(f.controller.actions.get('new')).key, 'a5');
});
test('binding an app changes the selected key, NOT its dial', async () => {
  const f = await fixture(); f.controller.mixer.assign('dev', 'a0');
  await f.event('sendToPlugin', 'key', { command: 'bindKey', key: 'a7' });
  assert.equal(f.controller.appFor(f.controller.actions.get('key')).key, 'a7');
  assert.equal(f.controller.mixer.device('dev').dials[0].key, 'a0');
  assert.ok(f.sent.some(m => m.event === 'setSettings' && m.context === 'key' && m.payload.application.key === 'a7'));
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.equal(f.controller.mixer.device('dev').dials[0].key, 'a7');
});
test('bound key survives page changes and offline restart via action settings', async () => {
  const f = await fixture();
  await f.event('sendToPlugin', 'key', { command: 'bindKey', key: 'a7' });
  const settings = JSON.parse(JSON.stringify(f.controller.actions.get('key').settings));
  f.controller.mixer.turnPage('dev', 1);
  assert.equal(f.controller.appFor(f.controller.actions.get('key')).key, 'a7');
  await f.event('willDisappear', 'key'); f.controller.mixer.update([]);
  await f.controller.handle({ event: 'willAppear', action: KEY, context: 'replacement', device: 'dev', payload: { coordinates: { column: 0, row: 0 }, settings } });
  const offline = f.controller.appFor(f.controller.actions.get('replacement'));
  assert.equal(offline.key, 'a7'); assert.equal(offline.name, 'App 7'); assert.equal(offline.online, false);
});
test('automatic option unbinds a fixed key without changing dial assignments', async () => {
  const f = await fixture();
  await f.event('sendToPlugin', 'key', { command: 'bindKey', key: 'a7' });
  await f.event('sendToPlugin', 'key', { command: 'bindKey', key: '' });
  assert.equal(f.controller.appFor(f.controller.actions.get('key')).key, 'a0');
  assert.equal(f.controller.mixer.device('dev').dials[0].key, null);
});
test('locked selection reports the exact reason; explicit unlock permits the same press', async () => {
  const f = await fixture(); f.controller.mixer.assign('dev', 'a0');
  f.controller.mixer.device('dev').dials[0].locked = true;
  await f.event('sendToPlugin', 'key', { command: 'bindKey', key: 'a7' });
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.equal(f.controller.mixer.device('dev').dials[0].key, 'a0');
  const status = f.sent.filter(m => m.event === 'sendToPropertyInspector').at(-1).payload;
  assert.match(status.notice, /Валкодер 1.*LOCK/);
  assert.equal(status.channels[0].locked, true);
  await f.event('sendToPlugin', 'key', { command: 'unlock', slot: 0 });
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.equal(f.controller.mixer.device('dev').dials[0].key, 'a7');
  assert.equal(f.controller.mixer.device('dev').dials[0].locked, false);
});
test('a hidden stale selected dial falls back to the visible mixer channel', async () => {
  const f = await fixture(); f.controller.mixer.device('dev').selected = 3;
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.equal(f.controller.mixer.device('dev').selected, 0);
  assert.equal(f.controller.mixer.device('dev').dials[0].key, 'a0');
});
test('fixed applications are excluded and sparse auto keys are filled consecutively', async () => {
  const f = await fixture();
  await f.event('sendToPlugin', 'key', { command: 'bindKey', key: 'a0' });
  async function add(context, column, row, settings = {}) {
    await f.controller.handle({ event: 'willAppear', action: KEY, context, device: 'dev', payload: { coordinates: { column, row }, settings } });
  }
  await add('fixed2', 1, 0, { application: { key: 'a1', name: 'App 1' } });
  await add('auto2', 3, 1, { slot: 7 }); // Arrives before an earlier physical slot.
  await add('auto1', 0, 1, { slot: 4 });
  const app = context => f.controller.appFor(f.controller.actions.get(context));
  assert.equal(app('auto1').key, 'a2'); assert.equal(app('auto2').key, 'a3');
  assert.equal(f.controller.pageFor('dev').count, 8);
  const found = new Set();
  for (let i = 0; i < 8; i++) {
    found.add(app('auto1').key); found.add(app('auto2').key);
    await f.event('sendToPlugin', 'auto1', { command: 'page', delta: 1 });
  }
  assert.equal(found.size, 16); assert.equal(found.has('a0'), false); assert.equal(found.has('a1'), false);
  assert.equal(app('key').key, 'a0'); assert.equal(app('fixed2').key, 'a1');
});
test('fixed-key exclusions are scoped to the current device and reflow on removal', async () => {
  const f = await fixture();
  await f.event('sendToPlugin', 'key', { command: 'bindKey', key: 'a0' });
  for (const [context, device] of [['local', 'dev'], ['other', 'other-device']]) {
    await f.controller.handle({ event: 'willAppear', action: KEY, context, device, payload: { coordinates: { column: 1, row: 0 } } });
  }
  const app = context => f.controller.appFor(f.controller.actions.get(context));
  assert.equal(app('local').key, 'a1'); assert.equal(app('other').key, 'a0');
  await f.event('willDisappear', 'key'); assert.equal(app('local').key, 'a0');
});
test('manual keys and dial assignments survive global automatic exclusions', async () => {
  const f = await fixture();
  await f.event('sendToPlugin', 'key', { command: 'exclude', key: 'a0' });
  assert.equal(f.controller.appFor(f.controller.actions.get('key')).key, 'a1');
  await f.event('sendToPlugin', 'key', { command: 'bindKey', key: 'a0' });
  assert.equal(f.controller.appFor(f.controller.actions.get('key')).key, 'a0');
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.equal(f.controller.mixer.device('dev').dials[0].key, 'a0');
  assert.ok(f.sent.some(m => m.event === 'setGlobalSettings' && m.payload.excludedKeys.includes('a0')));
  await f.event('sendToPlugin', 'key', { command: 'include', key: 'a0' });
  assert.deepEqual(f.controller.mixer.excludedKeys, []);
});
async function offlineExecutableFixture() {
  const f = await fixture();
  const app = { key: 'c:\\apps\\music.exe', name: 'Music', online: true, volume: 50 };
  f.controller.mixer.update([...apps, app]);
  await f.event('sendToPlugin', 'key', { command: 'bindKey', key: app.key });
  f.controller.mixer.update([]);
  f.controller.audio.request = async (op, payload) => { f.calls.push({ op, ...payload }); return { launch: { status: 'started' } }; };
  return { ...f, app };
}
test('short press launches an offline fixed application and selects it for the visible dial', async () => {
  const f = await offlineExecutableFixture();
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.deepEqual(f.calls, [{ op: 'launch', key: f.app.key }]);
  assert.equal(f.controller.mixer.device('dev').dials[0].key, f.app.key);
  assert.equal(f.controller.mixer.app(f.app.key).online, false);
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.equal(f.calls.length, 1, 'Repeated presses during startup must not enqueue more launches');
});
test('an existing process without audio reports already running without a second launch', async () => {
  const f = await offlineExecutableFixture();
  f.controller.audio.request = async () => ({ launch: { status: 'already-running' } });
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.match(f.controller.notices.get('dev').message, /уже работает/);
});
test('long press and locked reassignment never launch an executable', async () => {
  const f = await offlineExecutableFixture();
  await f.event('keyDown', 'key'); f.advance(700); await f.event('keyUp', 'key');
  assert.deepEqual(f.calls, []);
  f.controller.mixer.catalog.a0 = { key: 'a0', name: 'App 0' };
  f.controller.mixer.assign('dev', 'a0'); f.controller.mixer.device('dev').dials[0].locked = true;
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.deepEqual(f.calls, []);
});
test('launch failure is visible and permits an immediate retry', async () => {
  const f = await offlineExecutableFixture();
  f.controller.audio.request = async () => { throw new Error('Executable not found'); };
  await f.event('keyDown', 'key'); await f.event('keyUp', 'key');
  assert.match(f.controller.notices.get('dev').message, /Executable not found/);
  assert.equal(f.controller.launching.has(f.app.key), false);
});
