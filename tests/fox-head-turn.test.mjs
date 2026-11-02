import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FoxHeadTurn, getHeadTurnTarget, getHeadTurnPitch } from '../src/scripts/fox-head-turn.ts';
import { FoxTransition } from '../src/scripts/fox-transition.ts';

test('horizontal targets distinguish left, front, and right at every display size', () => {
	const bounds = { left: 100, width: 200 };
	assert.equal(getHeadTurnTarget(-1000, bounds), 0);
	assert.equal(getHeadTurnTarget(176, bounds), 4);
	assert.equal(getHeadTurnTarget(2000, bounds), 8);
	assert.equal(getHeadTurnTarget(250, bounds), getHeadTurnTarget(500, { left: 200, width: 400 }));
});

test('a full turn visits every frame and settles at its destination', () => {
	const turn = new FoxHeadTurn();
	turn.aim(8, 0);
	const frames = new Set();
	for (let t = 0; t <= 1000; t += 16) frames.add(turn.update(t).frame);
	assert.deepEqual([...frames], [0,1,2,3,4,5,6,7,8]);
	assert.deepEqual(turn.update(1000), { frame: 8, moving: false });
});

test('reversal starts at the current head and cancellation cannot resume an old turn', () => {
	const turn = new FoxHeadTurn();
	turn.aim(8, 0);
	for (let t = 16; t < 400; t += 16) turn.update(t);
	const before = turn.update(400).frame;
	turn.aim(0, 400);
	assert.equal(turn.update(400).frame, before);
	for (let t = 416; t <= 1600; t += 16) turn.update(t);
	assert.equal(turn.update(1600).frame, 0);
	turn.aim(8, 1700);
	turn.cancel(2000);
	assert.deepEqual(turn.update(2000), turn.update(100000));
	turn.seek(4);
	assert.deepEqual(turn.update(100001), { frame: 4, moving: false });
});

test('frequent pointer retargeting keeps progressing and boundary noise does not flicker', () => {
	const turn = new FoxHeadTurn();
	for (let t = 0; t < 1000; t += 16) { turn.aim(7.8 + .1 * Math.sin(t), t); turn.update(t); }
	assert.equal(turn.update(1000).frame, 8);
	turn.seek(4);
	for (let t = 1016; t < 1500; t += 16) { turn.aim(4 + .1 * Math.sin(t), t); assert.equal(turn.update(t).frame, 4); }
});

test('pitch is limited to a gentle shoulder bend and changes sign across the frontal view', () => {
	assert.equal(getHeadTurnPitch(22, 0), 7);
	assert.equal(getHeadTurnPitch(22, 4), 0);
	assert.equal(getHeadTurnPitch(22, 8), -7);
	assert.equal(getHeadTurnPitch(1000, 0), 7);
	assert.equal(getHeadTurnPitch(-1000, 8), 7);
});

test('leaving a sitting pose waits for the head but collapse and reduced motion bypass the wait', () => {
	const transition = new FoxTransition('sitting');
	assert.deepEqual(transition.update('sleeping', 0, true, true), { pose: 'sitting', frame: null, moving: false, clip: null });
	assert.equal(transition.update('sleeping', 900, true, false).clip, 'lie');
	assert.equal(transition.update('badge', 901, true, true).pose, 'badge');
	const reduced = new FoxTransition('sitting');
	assert.equal(reduced.update('sleeping', 0, false, true).pose, 'sleeping');
});
