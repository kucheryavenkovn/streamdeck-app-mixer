import test from 'node:test';
import assert from 'node:assert/strict';
import { keySvg, dialSvg } from '../src/render.mjs';
test('ring starts at noon and fills clockwise with percent label', () => {
  const image = keySvg({ name: 'Chrome', volume: 65, online: true });
  assert.match(image, /rotate\(-90 72 72\)/); assert.match(image, />65<\/text>/); assert.match(image, /stroke-dasharray=/);
});
test('zero volume has no filled arc; mute and offline are distinct', () => {
  assert.doesNotMatch(keySvg({ name: 'X', volume: 0 }), /stroke-dasharray=/);
  assert.match(keySvg({ name: 'X', volume: 65, muted: true }), />M<\/text>/);
  assert.match(keySvg({ name: 'X', volume: 65, online: false }), />—<\/text>/);
});
test('target application names cannot inject SVG', () => {
  const image = dialSvg({ name: '<script>&"', volume: 50 });
  assert.doesNotMatch(image, /<script>/); assert.match(image, /&lt;script&gt;/);
});
test('dial reports page, locked assignment and mixed session levels', () => {
  const image = dialSvg({ name: 'X', volume: 80, mixed: true }, { slot: 2, locked: true, page: 1, count: 3 });
  assert.match(image, /3 LOCK/); assert.match(image, /2\/3/); assert.match(image, /80% ≈/);
});
