import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FoxTransition, HEAD_RETURN_MS } from '../src/scripts/fox-transition.ts';
import { motionDuration, motionFramePose } from '../src/scripts/fox-motion.ts';

test('each transition starts and finishes on original artwork, with painted in-betweens', () => {
	for (const [from, to, clip] of [['resting','sitting','rise'], ['sitting','resting','lie'], ['resting','sleeping','sleep'], ['sleeping','resting','wake']]) {
		const f = new FoxTransition(from), lead = from === 'sitting' ? HEAD_RETURN_MS : 0;
		const first = f.update(to, 0);
		assert.equal(first.pose, from);
		assert.equal(first.frame, null);
		assert.equal(first.clip, clip);
		assert.notEqual(f.update(to, lead + 300).frame, null);
		const last = f.update(to, lead + motionDuration(clip) - 1);
		assert.equal(last.pose, to);
		assert.equal(last.frame, null);
		assert.deepEqual(f.update(to, lead + motionDuration(clip)), { pose: to, frame: null, moving: false, clip: null });
	}
});

test('sitting to sleeping passes through resting; waking to sitting does likewise', () => {
	const f = new FoxTransition('sitting');
	assert.equal(f.update('sleeping', 0).clip, 'lie');
	const afterLie = HEAD_RETURN_MS + motionDuration('lie');
	assert.equal(f.update('sleeping', afterLie).clip, 'sleep');
	const asleep = afterLie + motionDuration('sleep');
	assert.equal(f.update('sleeping', asleep).pose, 'sleeping');
	assert.equal(f.update('sitting', asleep + 1).clip, 'wake');
	assert.equal(f.update('sitting', asleep + 1 + motionDuration('wake')).clip, 'rise');
});

test('rapid requests retain current gesture and only the latest destination', () => {
	const f = new FoxTransition();
	f.update('sitting', 0);
	assert.equal(f.update('sleeping', 200).clip, 'rise');
	assert.equal(f.update('resting', 400).clip, 'rise');
	assert.equal(f.update('resting', motionDuration('rise')).clip, 'lie');
	const end = motionDuration('rise') + HEAD_RETURN_MS + motionDuration('lie');
	assert.equal(f.update('resting', end).moving, false);
	assert.equal(f.update('resting', end).pose, 'resting');
});

test('collapse cancels a gesture immediately and expansion never replays stale frames', () => {
	const f = new FoxTransition();
	f.update('sitting', 0);
	f.update('sitting', 350);
	assert.deepEqual(f.update('badge', 351), { pose: 'badge', frame: null, moving: false, clip: null });
	assert.deepEqual(f.update('resting', 352), { pose: 'resting', frame: null, moving: false, clip: null });
});

test('reduced motion, missing assets and lifecycle suspension settle without animation', () => {
	const f = new FoxTransition();
	f.update('sitting', 0);
	assert.equal(f.update('sleeping', 250, false).pose, 'sleeping');
	assert.equal(f.update('sleeping', 250, false).moving, false);
	assert.equal(f.update('sleeping', 251, true).moving, false);
	assert.equal(f.update('resting', 252, true).clip, 'wake');
});

test('head return has time to finish before leaving the seated original', () => {
	const f = new FoxTransition('sitting');
	f.update('resting', 0);
	const settling = f.update('resting', HEAD_RETURN_MS - 1);
	assert.equal(settling.pose, 'sitting');
	assert.equal(settling.frame, null);
});

test('preview endpoint mapping agrees with all four original pose pairs', () => {
	assert.deepEqual([0,7,8,15,16,23,24,31].map(motionFramePose), ['resting','sitting','sitting','resting','resting','sleeping','sleeping','resting']);
	for (const frame of [1,6,9,14,17,22,25,30]) assert.equal(motionFramePose(frame), null);
});
