import test from 'node:test';
import assert from 'node:assert/strict';
import { Mixer } from '../src/model.mjs';
const apps = n => Array.from({ length: n }, (_, i) => ({ key: `app${i}`, name: `App ${i}`, volume: 50, online: true }));

test('all applications are reachable in eight-key pages', () => {
  const m = new Mixer(); m.update(apps(25));
  const found = new Set();
  for (let i = 0; i < 4; i++) { m.page('one').apps.forEach(a => found.add(a.key)); m.turnPage('one', 1); }
  assert.equal(found.size, 25); assert.equal(m.page('one').index, 0);
});
test('pins stay first on every page; no apps lost', () => {
  const m = new Mixer(); m.update(apps(20)); m.togglePin('one', 'app13'); m.togglePin('one', 'app4');
  const found = new Set();
  for (let i = 0; i < 3; i++) {
    const p = m.page('one'); assert.equal(p.apps[0].key, 'app13'); assert.equal(p.apps[1].key, 'app4');
    p.apps.forEach(a => found.add(a.key)); m.turnPage('one', 1);
  }
  assert.equal(found.size, 20);
});
test('max seven pins leaves at least one pageable slot', () => {
  const m = new Mixer(); m.update(apps(10));
  for (let i = 0; i < 7; i++) assert.equal(m.togglePin('one', `app${i}`), true);
  assert.equal(m.togglePin('one', 'app7'), false); assert.equal(m.page('one').count, 3);
});
test('page changes do not change dial assignments', () => {
  const m = new Mixer(); m.update(apps(19)); m.assign('one', 'app2'); m.device('one').dials[0].locked = true;
  m.turnPage('one', 1); assert.equal(m.device('one').dials[0].key, 'app2');
  assert.equal(m.assign('one', 'app9'), false); assert.equal(m.assign('one', 'app2'), true);
});
test('pinned and assigned offline applications survive restart', () => {
  const m = new Mixer(); m.update(apps(3)); m.togglePin('one', 'app2'); m.assign('one', 'app0'); m.update([]);
  const restored = new Mixer(JSON.parse(JSON.stringify(m.snapshot())));
  assert.equal(restored.page('one').apps[0].key, 'app2'); assert.equal(restored.app('app2').online, false);
  assert.equal(restored.app(restored.device('one').dials[0].key).online, false);
  restored.update(apps(3)); assert.equal(restored.app('app0').online, true);
});
test('devices have independent pins, selected channels and assignments', () => {
  const m = new Mixer(); m.update(apps(12)); m.assign('one', 'app2'); m.togglePin('one', 'app5'); m.turnPage('one', 1);
  assert.deepEqual(m.device('two').pins, []); assert.equal(m.device('two').dials[0].key, null); assert.equal(m.page('two').index, 0);
});
test('empty list is one page; shrinking list clamps page', () => {
  const m = new Mixer(); assert.deepEqual(m.page('one'), { apps: [], count: 1, index: 0 });
  m.update(apps(20)); m.turnPage('one', -1); assert.equal(m.page('one').index, 2);
  m.update(apps(2)); assert.equal(m.page('one').index, 0);
});
test('pin order can be changed, duplicate pins are not created', () => {
  const m = new Mixer(); m.update(apps(4)); m.togglePin('one', 'app2'); m.togglePin('one', 'app1');
  m.movePin('one', 'app1', -1); assert.deepEqual(m.device('one').pins, ['app1', 'app2']);
  m.togglePin('one', 'app1'); assert.deepEqual(m.device('one').pins, ['app2']);
});
test('obsolete unpinned catalog metadata is pruned', () => {
  const m = new Mixer(); m.update(apps(3)); m.update([]); assert.deepEqual(m.catalog, {});
});
test('excluded apps never appear in automatic pages, including favorites', () => {
  const m = new Mixer(); m.update(apps(12)); m.togglePin('one', 'app0');
  m.exclude('app0'); m.exclude('app7'); m.exclude('app7');
  const found = new Set();
  for (let i = 0; i < 5; i++) { m.page('one', 2).apps.forEach(a => found.add(a.key)); m.turnPage('one', 1, 2); }
  assert.equal(found.size, 10); assert.equal(found.has('app0'), false); assert.equal(found.has('app7'), false);
  assert.equal(m.app('app7').name, 'App 7'); assert.equal(m.assign('one', 'app7'), true);
  assert.equal(m.excludedKeys.length, 2);
});
test('exclusions persist while offline, and can be removed', () => {
  const m = new Mixer(); m.update(apps(3)); m.exclude('app1'); m.update([]);
  const restored = new Mixer(JSON.parse(JSON.stringify(m.snapshot())));
  assert.equal(restored.app('app1').name, 'App 1');
  restored.update(apps(3)); assert.equal(restored.page('one').apps.some(a => a.key === 'app1'), false);
  restored.include('app1'); assert.equal(restored.page('one').apps.some(a => a.key === 'app1'), true);
});
test('zero automatic slots and all-excluded lists are valid empty pages', () => {
  const m = new Mixer(); m.update(apps(2)); m.turnPage('one', 1, 0);
  assert.deepEqual(m.page('one', 0), { apps: [], count: 1, index: 0 });
  m.exclude('app0'); m.exclude('app1'); assert.deepEqual(m.page('one'), { apps: [], count: 1, index: 0 });
});
