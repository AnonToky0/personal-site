import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInSideGutter } from '../src/scripts/fox-pointer.ts';

test('gutters start outside the full menu width and padding, not the narrower reading column', () => {
	const content = { left: 90, right: 1190 };
	assert.equal(isInSideGutter(40, content, 1280), true);
	assert.equal(isInSideGutter(1240, content, 1280), true);
	for (const x of [66, 90, 200, 640, 1080, 1190, 1214]) {
		assert.equal(isInSideGutter(x, content, 1280, true), false);
	}
});

test('hysteresis stays entirely outside the content on both sides', () => {
	const content = { left: 250, right: 1030 };
	for (const x of [222, 1058]) {
		assert.equal(isInSideGutter(x, content, 1280), false);
		assert.equal(isInSideGutter(x, content, 1280, true), true);
	}
	for (const x of [226, 1054]) {
		assert.equal(isInSideGutter(x, content, 1280, true), false);
	}
});

test('narrow gutters, resized columns and pointers outside the viewport do not activate', () => {
	assert.equal(isInSideGutter(10, { left: 20, right: 370 }, 390, true), false);
	assert.equal(isInSideGutter(380, { left: 20, right: 370 }, 390, true), false);
	assert.equal(isInSideGutter(100, { left: 80, right: 1180 }, 1280, true), false);
	assert.equal(isInSideGutter(-1, { left: 250, right: 1030 }, 1280), false);
	assert.equal(isInSideGutter(1280, { left: 250, right: 1030 }, 1280), false);
});
