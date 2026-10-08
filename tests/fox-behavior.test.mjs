import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FoxBehavior, FOX_TIMING as t } from '../src/scripts/fox-behavior.ts';

const fox = () => new FoxBehavior(0, () => 0);

test('a side gutter sits the fox even far away, and returning to content clears the butterfly', () => {
	const f = fox();
	f.pointer(1, false, true);
	assert.deepEqual(f.view(1), { state: 'sitting', butterfly: 'following' });
	f.advance(t.lookMin);
	assert.equal(f.lookUntil, 0);
	f.pointer(t.lookMin + 1, false, false);
	assert.deepEqual(f.view(t.lookMin + 1), { state: 'resting', butterfly: 'hidden' });
});

test('layout updates do not keep a stationary gutter pointer awake', () => {
	const f = fox();
	f.pointer(1, false, true);
	f.setPointerRegion(false, true);
	assert.deepEqual(f.view(t.idle + 1), { state: 'sleeping', butterfly: 'hidden' });
	f.pointer(t.idle + 2, false, true);
	assert.deepEqual(f.view(t.idle + 2), { state: 'sitting', butterfly: 'following' });
	f.setPointerRegion(false, false);
	assert.deepEqual(f.view(t.idle + 2), { state: 'resting', butterfly: 'hidden' });
});

test('collapse, leaving and loss of focus cancel gutter interaction', () => {
	for (const cancel of [f => f.setCollapsed(true, 2), f => f.leavePointer(), f => f.setActive(false, 2)]) {
		const f = fox();
		f.pointer(1, false, true);
		cancel(f);
		assert.equal(f.inSideGutter, false);
		assert.equal(f.view(2).butterfly, 'hidden');
	}
});

test('idle sleep takes priority over a stationary pointer and new input wakes the fox', () => {
	const f = fox();
	f.pointer(100, true);
	assert.equal(f.view(100).state, 'sitting');
	assert.deepEqual(f.view(100 + t.idle), { state: 'sleeping', butterfly: 'hidden' });
	f.pointer(100 + t.idle + 1, false);
	assert.equal(f.view(100 + t.idle + 1).state, 'resting');
});

test('the butterfly stays at the pointer during a pause and disappears immediately on leaving', () => {
	const f = fox();
	f.pointer(10, true);
	assert.equal(f.view(10).butterfly, 'following');
	f.advance(10_000);
	assert.deepEqual(f.view(10_000), { state: 'sitting', butterfly: 'following' });
	f.pointer(10_100, false);
	assert.deepEqual(f.view(10_100), { state: 'resting', butterfly: 'hidden' });
	f.pointer(10_200, true);
	f.leavePointer();
	assert.deepEqual(f.view(10_200), { state: 'resting', butterfly: 'hidden' });
});

test('random looks occur only with a mouse on the page and finish without mouse tracking', () => {
	const f = fox();
	f.advance(t.lookMin);
	assert.equal(f.view(t.lookMin).state, 'resting');
	f.pointer(t.lookMin + 1, false);
	f.advance(t.lookMin * 2);
	assert.equal(f.view(t.lookMin * 2).state, 'sitting');
	assert.equal(f.view(t.lookMin * 2 + t.lookDuration).state, 'resting');
});

test('collapse cancels a look and a butterfly; background timers never expand it', () => {
	const f = fox();
	f.pointer(1, true);
	f.setCollapsed(true, 2);
	f.advance(200_000);
	assert.deepEqual(f.view(200_000), { state: 'badge', butterfly: 'hidden' });
	f.setCollapsed(false, 200_001);
	assert.equal(f.view(200_001).state, 'resting');
});

test('leaving the browser restores the cursor and suspends attention', () => {
	const f = fox();
	f.pointer(1, true);
	f.setActive(false, 2);
	f.advance(t.lookMin);
	assert.deepEqual(f.view(t.lookMin), { state: 'resting', butterfly: 'hidden' });
	f.setActive(true, t.idle + 10);
	assert.deepEqual(f.view(t.idle + 10), { state: 'resting', butterfly: 'hidden' });
});

test('reduced motion suppresses unsolicited random looks but preserves deliberate interaction', () => {
	const f = fox();
	f.reducedMotion = true;
	f.pointer(1, false);
	f.advance(t.lookMin);
	assert.equal(f.view(t.lookMin).state, 'resting');
	f.pointer(t.lookMin + 1, true);
	assert.equal(f.view(t.lookMin + 1).state, 'sitting');
});

test('manual preview is isolated from idle timers and returns to live behavior', () => {
	const f = fox();
	f.setMode('sitting', 1);
	assert.deepEqual(f.view(t.idle + 1), { state: 'sitting', butterfly: 'hidden' });
	f.setMode('auto', t.idle + 2);
	assert.equal(f.view(t.idle + 2).state, 'resting');
});

test('keyboard focus wakes and sits the fox without hiding the pointer', () => {
	const f = fox();
	f.setFocus(true, t.idle + 1);
	assert.deepEqual(f.view(t.idle + 1), { state: 'sitting', butterfly: 'hidden' });
	f.setFocus(false, t.idle + 2);
	assert.equal(f.view(t.idle + 2).state, 'resting');
});
