import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ButterflyMotion } from '../src/scripts/butterfly-motion.ts';

function sampleFor(motion, start, end, scrolling = false) {
	const frames = [];
	for (let now = start; now <= end; now += 16) {
		if (scrolling) motion.scroll(now);
		frames.push(motion.update(now, true));
	}
	return frames;
}
const peaks = frames => frames.filter((frame, i) => i > 0 && i < frames.length - 1 &&
	frame.angle > frames[i - 1].angle && frame.angle >= frames[i + 1].angle).length;

test('gentle flight opens and closes the wings while keeping the body still', () => {
	const motion = new ButterflyMotion();
	const frames = sampleFor(motion, 0, 6_000);
	assert.ok(peaks(frames) >= 6 && peaks(frames) <= 7);
	assert.ok(frames.some(frame => frame.angle > 31));
	assert.ok(frames.every(frame => frame.angle >= 0 && frame.angle <= 32 && frame.float === 0));
});

test('continued scrolling increases wing beats and adds only a bounded float', () => {
	const gentle = sampleFor(new ButterflyMotion(), 0, 6_000);
	const flutter = sampleFor(new ButterflyMotion(), 0, 6_000, true);
	assert.ok(peaks(flutter) > peaks(gentle) * 1.7);
	assert.ok(flutter.some(frame => frame.angle > 50));
	assert.ok(flutter.some(frame => Math.abs(frame.float) > 1));
	assert.ok(flutter.every(frame => frame.angle <= 58 && Math.abs(frame.float) <= 1.8));
});

test('stopping scroll eases back over about a second without restarting a beat', () => {
	const motion = new ButterflyMotion();
	const moving = sampleFor(motion, 0, 1_600, true);
	const settling = sampleFor(motion, 1_616, 2_816);
	assert.ok(settling[0].energy > .9);
	assert.ok(settling.at(-1).energy < .05);
	const all = [...moving, ...settling];
	for (let i = 1; i < all.length; i++) assert.ok(Math.abs(all[i].angle - all[i - 1].angle) < 10);
});

test('hidden, paused, and reduced-motion states cancel the motion and discard old scrolls', () => {
	const motion = new ButterflyMotion();
	sampleFor(motion, 0, 800, true);
	const still = { angle: 0, float: 0, energy: 0 };
	assert.deepEqual(motion.update(816, false), still);
	motion.scroll(1_000);
	assert.deepEqual(motion.update(10_000, true), still);
	assert.equal(motion.update(10_016, true).energy, 0);
});

test('a delayed animation frame does not jump through seconds of wing beats', () => {
	const delayed = new ButterflyMotion(), normal = new ButterflyMotion();
	delayed.update(0, true); normal.update(0, true);
	assert.deepEqual(delayed.update(60_000, true), normal.update(64, true));
});
