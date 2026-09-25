import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoolSize, calculatePool } from '../../assets/js/chatbot/pool-calculator.js';

test('parses rectangle written as 8x4x1.5', () => {
  assert.deepEqual(parsePoolSize('my pool is 8x4x1.5'), {
    shape: 'rect', length: 8, width: 4, depth: 1.5, depthAssumed: false,
  });
});

test('parses "by" wording and comma decimals', () => {
  const size = parsePoolSize('10 by 5 meters, 1,6 deep');
  assert.equal(size.length, 10);
  assert.equal(size.width, 5);
  assert.equal(size.depth, 1.6);
});

test('assumes 1.5 m depth when only length and width are given', () => {
  const size = parsePoolSize('pool 6 by 3');
  assert.equal(size.depth, 1.5);
  assert.equal(size.depthAssumed, true);
});

test('parses volume in m3', () => {
  assert.deepEqual(parsePoolSize('around 60 m3'), { shape: 'volume', volume: 60 });
});

test('parses round pool with diameter', () => {
  const size = parsePoolSize('round pool 5m diameter 1.2 deep');
  assert.equal(size.shape, 'round');
  assert.equal(size.diameter, 5);
  assert.equal(size.depth, 1.2);
});

test('converts feet to meters', () => {
  const size = parsePoolSize('32 x 16 x 5 feet');
  assert.ok(Math.abs(size.length - 9.75) < 0.01);
  assert.ok(Math.abs(size.depth - 1.524) < 0.01);
});

test('rejects text without a usable size', () => {
  assert.equal(parsePoolSize('which pump do I need'), null);
  assert.equal(parsePoolSize('pool is 500 by 2'), null);
});

test('sizes an 8x4x1.5 pool', () => {
  const plan = calculatePool(parsePoolSize('8x4x1.5'));
  assert.equal(plan.volume, 48);
  assert.equal(plan.flowRate, 8);
  assert.equal(plan.filter.diameterMm, 500);
  assert.equal(plan.pump.hp, 0.75);
  assert.equal(plan.accessories.skimmers, 2);
  assert.equal(plan.accessories.mainDrains, 2);
  assert.equal(plan.accessories.returnInlets, 2);
  assert.equal(plan.accessories.lights, 2);
  assert.equal(plan.accessories.hoseLength, 12);
  assert.equal(plan.chemicals.startChlorineKg, 0.26);
  assert.equal(plan.commercial, false);
});

test('flags very large pools as commercial', () => {
  const plan = calculatePool({ shape: 'volume', volume: 400 });
  assert.equal(plan.commercial, true);
  assert.equal(plan.filter, null);
});
