import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFoxHeadAngle, FOX_HEAD_LIMITS } from '../src/scripts/fox-gaze.ts';

const fox = { left: 1000, top: 600, width: 180, height: 180 };
const neck = { x: 1068.4, y: 654 };

test('head follows butterfly elevation and stays within a gentle neck range', () => {
	assert.equal(getFoxHeadAngle({ x: neck.x, y: 100 }, fox), FOX_HEAD_LIMITS.up);
	assert.equal(getFoxHeadAngle({ x: neck.x, y: 780 }, fox), FOX_HEAD_LIMITS.down);
	const high = getFoxHeadAngle({ x: 200, y: 100 }, fox);
	const low = getFoxHeadAngle({ x: 200, y: 500 }, fox);
	assert.ok(high > low);
});

test('moving past the head on either side has no 180 degree angle discontinuity', () => {
	const left = getFoxHeadAngle({ x: neck.x - 1, y: 500 }, fox);
	const right = getFoxHeadAngle({ x: neck.x + 1, y: 500 }, fox);
	assert.equal(left, right);
	assert.equal(getFoxHeadAngle(neck, fox), 0);
});

test('head direction is independent of fox display size', () => {
	const point = { x: 900, y: 500 };
	const doubled = { left: 2000, top: 1200, width: 360, height: 360 };
	assert.equal(getFoxHeadAngle(point, fox), getFoxHeadAngle({ x: 1800, y: 1000 }, doubled));
});
