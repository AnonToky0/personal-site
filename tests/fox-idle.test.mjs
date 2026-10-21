import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FoxIdle } from '../src/scripts/fox-idle.ts';

const awake = { pose: 'sitting', enabled: true, attentive: false };
const at = (fox, time, context = awake) => fox.update(time, context);

test('blink closes quickly, opens more slowly, and sometimes repeats after a pause', () => {
	const single = new FoxIdle(() => .5);
	at(single, 0); single.cue(1, 'blink');
	assert.equal(at(single, 76).blink, 1);
	assert.equal(at(single, 111).blink, 1);
	assert.ok(at(single, 180).blink > 0 && at(single, 180).blink < 1);
	assert.equal(at(single, 256).blink, 0);
	const double = new FoxIdle(() => 0);
	at(double, 0);
	at(double, 3_800);
	assert.equal(at(double, 3_875).blink, 1);
	assert.equal(at(double, 4_100).blink, 0);
	assert.equal(at(double, 4_280).blink, 1);
	assert.equal(at(double, 4_460).blink, 0);
});

test('attention moves one ear before tracking, tilts after tracking, then moves the tail', () => {
	const fox = new FoxIdle(() => .5);
	const context = { ...awake, attentive: true };
	assert.equal(at(fox, 0, context).gaze, 0);
	const ear = at(fox, 210, context);
	assert.notEqual(ear.nearEar, 0); assert.equal(ear.farEar, 0);
	assert.equal(ear.head, 0); assert.equal(ear.tail, 0); assert.equal(ear.gaze, 0);
	const looking = at(fox, 1_000, context);
	assert.equal(looking.gaze, 1); assert.equal(looking.nearEar, 0); assert.equal(looking.head, 0);
	const tilt = at(fox, 1_900, context);
	assert.notEqual(tilt.head, 0); assert.equal(tilt.tail, 0);
	const tail = at(fox, 3_875, context);
	assert.equal(tail.head, 0); assert.notEqual(tail.tail, 0);
	assert.equal(at(fox, 5_300, context).gesture, 'quiet');
	assert.equal(at(fox, 10_000, context).gesture, 'quiet');
});

test('sleep has slower breathing and no eye, ear, head, or tail gestures', () => {
	const awakeFox = new FoxIdle(() => 0), sleepyFox = new FoxIdle(() => 0);
	const sleep = { ...awake, pose: 'sleeping', attentive: true };
	at(awakeFox, 0); at(sleepyFox, 0, sleep);
	assert.ok(at(awakeFox, 2_350).breath > at(sleepyFox, 2_350, sleep).breath);
	for (const time of [3_800, 14_000, 100_000]) {
		const frame = at(sleepyFox, time, sleep);
		for (const key of ['blink', 'nearEar', 'farEar', 'head', 'tail']) assert.equal(frame[key], 0);
	}
});

test('another curious gesture does not pull an already-tracking head back to neutral', () => {
	const fox = new FoxIdle(() => .5);
	const context = { ...awake, attentive: true };
	at(fox, 0, context); at(fox, 5_300, context);
	at(fox, 6_000, context); at(fox, 7_000, context);
	at(fox, 20_501, context);
	assert.equal(at(fox, 20_701, context).gaze, 1);
});

test('collapse, transition, and reduced motion suspension discard pending actions without catch-up', () => {
	for (const context of [{ ...awake, enabled: false }, { ...awake, pose: 'badge' }]) {
		const fox = new FoxIdle(() => 0);
		at(fox, 0, { ...awake, attentive: true });
		const stopped = at(fox, 200, context);
		for (const key of ['blink', 'breath', 'nearEar', 'farEar', 'head', 'tail']) assert.equal(stopped[key], 0);
		assert.deepEqual(at(fox, 80_000), { ...stopped });
		assert.equal(at(fox, 80_100).gesture, 'quiet');
	}
});

test('pose changes cancel an in-flight blink and gestures do not collide with overdue blinks', () => {
	const fox = new FoxIdle(() => 0);
	at(fox, 0); fox.cue(1, 'blink');
	assert.equal(at(fox, 76).blink, 1);
	assert.equal(at(fox, 77, { ...awake, pose: 'resting' }).blink, 0);
	fox.cue(3_000, 'listen');
	assert.equal(at(fox, 4_000, { ...awake, pose: 'resting' }).blink, 0);
});
