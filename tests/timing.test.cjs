'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { simulationSlices } = require('../game/core.js');
const total = (steps) => steps.reduce((sum, value) => sum + value, 0);

test('normal and slow frames retain elapsed play time through 250 ms', () => {
  for (const elapsed of [1/120, 1/60, 0.05, 0.1, 0.15, 0.2, 0.25]) {
    const steps = simulationSlices(elapsed);
    assert.ok(Math.abs(total(steps) - elapsed) < 1e-12);
    assert.ok(steps.length <= 5);
    assert.ok(steps.every(step => step > 0 && step <= 0.05));
  }
});

test('a stalled frame has a bounded backlog and bounded collision steps', () => {
  for (const elapsed of [0.251, 0.5, 1, 60, Number.MAX_VALUE]) {
    const steps = simulationSlices(elapsed);
    assert.equal(steps.length, 5);
    assert.equal(total(steps), 0.25);
    assert.ok(steps.every(step => step <= 0.05));
  }
});

test('first frame and invalid elapsed values cannot advance simulation', () => {
  for (const elapsed of [0, -1, NaN, Infinity, -Infinity, undefined, null, '0.1']) {
    assert.deepEqual(simulationSlices(elapsed), [0]);
  }
});

test('a 10 fps cadence advances ten seconds over one hundred frames', () => {
  assert.ok(Math.abs(Array.from({ length: 100 }, () => total(simulationSlices(0.1)))
    .reduce((sum, seconds) => sum + seconds, 0) - 10) < 1e-12);
});
