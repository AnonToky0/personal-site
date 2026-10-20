import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOX_CLIPS, motionSteps, motionDuration, sampleMotion, frameTime } from '../src/scripts/fox-motion.ts';

test('every clip plays each painted frame once and holds its final pose', () => {
	for (const clip of FOX_CLIPS) {
		const steps = motionSteps(clip.id);
		let time = 0;
		for (let i = 0; i < 8; i++) {
			assert.equal(sampleMotion(clip.id, time).frame, clip.row * 8 + i);
			time += steps[i].duration;
		}
		assert.equal(time, motionDuration(clip.id));
		assert.equal(sampleMotion(clip.id, time).frame, clip.row * 8 + 7);
		assert.equal(sampleMotion(clip.id, time + 10_000).ended, true);
	}
});

test('full sequence connects the four actions with deliberate resting intervals', () => {
	const steps = motionSteps('all');
	assert.deepEqual(steps.filter(step => !step.hold).map(step => step.frame), Array.from({ length: 32 }, (_, i) => i));
	assert.equal(steps[0].frame, 0);
	assert.equal(steps.at(-1).frame, 31);
	assert.equal(steps.filter(step => step.hold).length, 5);
	assert.equal(motionDuration('all'), 11_300);
});

test('scrubbing and frame selection use the same timeline in individual and full playback', () => {
	for (const sequence of ['all', ...FOX_CLIPS.map(clip => clip.id)]) {
		for (const step of motionSteps(sequence).filter(step => !step.hold)) {
			const time = frameTime(sequence, step.frame);
			assert.equal(sampleMotion(sequence, time).frame, step.frame);
			assert.equal(sampleMotion(sequence, time).hold, false);
		}
		assert.equal(sampleMotion(sequence, -100).elapsed, 0);
		assert.equal(sampleMotion(sequence, NaN).elapsed, 0);
	}
});
