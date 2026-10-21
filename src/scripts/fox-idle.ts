import type { FoxPose } from './fox-behavior.ts';

export type IdleContext = { pose: FoxPose | 'badge'; enabled: boolean; attentive: boolean };
export type IdleCue = 'blink' | 'listen' | 'tail' | 'curious';
export type IdleSample = {
	blink: number; breath: number; nearEar: number; farEar: number;
	tail: number; head: number; gaze: number; gesture: 'quiet' | 'listening' | 'looking' | 'tilting' | 'tail';
};
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const pulse = (t: number, inEnd: number, holdEnd: number, end: number) =>
	t < 0 || t >= end ? 0 : t < inEnd ? smooth(t / inEnd) : t < holdEnd ? 1 : 1 - smooth((t - holdEnd) / (end - holdEnd));
const neutral = (): IdleSample => ({ blink: 0, breath: 0, nearEar: 0, farEar: 0, tail: 0, head: 0, gaze: 1, gesture: 'quiet' });

/** One clock coordinates the gestures. Suspension discards overdue actions,
 * and a new pose always starts with its untouched artwork. */
export class FoxIdle {
	private pose?: IdleContext['pose'];
	private running = false;
	private started = 0;
	private nextBlink = 0;
	private nextGesture = 0;
	private nextAttention = 0;
	private breathPeriod = 5_200;
	private wasAttentive = false;
	private blink?: { start: number; double: boolean };
	private sequence?: { start: number; attentive: boolean; lead: boolean; direction: number; near: boolean };
	private random: () => number;
	constructor(random: () => number = Math.random) { this.random = random; }
	private between(min: number, max: number) { return min + this.random() * (max - min); }

	/** Explicit preview cues use the very same envelopes as ordinary behavior. */
	cue(now: number, cue: IdleCue) {
		if (!this.running || this.pose === 'sleeping' || this.pose === 'badge') return;
		this.blink = undefined; this.sequence = undefined;
		if (cue === 'blink') this.blink = { start: now, double: false };
		else this.sequence = { start: now - (cue === 'tail' ? 3_500 : 0), attentive: cue === 'curious', lead: false, direction: 1, near: true };
		this.nextGesture = now + this.between(22_000, 39_000);
		this.nextAttention = now + this.between(16_000, 25_000);
	}

	update(now: number, context: IdleContext): IdleSample {
		const { pose, enabled, attentive } = context;
		if (!enabled || pose === 'badge') {
			this.running = false; this.blink = undefined; this.sequence = undefined;
			this.wasAttentive = false;
			return neutral();
		}
		if (!this.running || this.pose !== pose) {
			this.running = true; this.pose = pose; this.started = now;
			this.blink = undefined; this.sequence = undefined;
			this.wasAttentive = false;
			this.nextBlink = now + this.between(3_800, 7_500);
			this.nextGesture = now + this.between(14_000, 26_000);
			this.nextAttention = now;
			this.breathPeriod = pose === 'sleeping' ? this.between(7_000, 9_000) : this.between(4_700, 6_100);
		}
		const result = neutral();
		result.breath = (1 - Math.cos((now - this.started) / this.breathPeriod * Math.PI * 2)) / 2;
		if (pose === 'sleeping') return result;

		if (this.sequence && now - this.sequence.start >= 5_200) this.sequence = undefined;
		if (!this.sequence && !this.blink && ((attentive && now >= this.nextAttention) || now >= this.nextGesture)) {
			this.sequence = { start: now, attentive, lead: attentive && !this.wasAttentive, direction: this.random() < .5 ? -1 : 1, near: this.random() < .65 };
			this.nextGesture = now + this.between(22_000, 39_000);
			this.nextAttention = now + this.between(16_000, 25_000);
		}
		if (this.sequence) {
			const { start, direction, near, lead, attentive: interested } = this.sequence;
			const t = now - start;
			const ear = pulse(t, 210, 410, 860);
			result.nearEar = near ? ear * direction * 5 : 0;
			result.farEar = near ? 0 : ear * direction * 6;
			result.head = direction * (interested ? 4 : 2) * pulse(t - 1_200, 550, 1_200, 2_100);
			// The ears lead the first gaze; subsequent tracking remains responsive.
			result.gaze = lead ? smooth((t - 280) / 620) : 1;
			const tailTime = (t - 3_500) / 1_500;
			result.tail = tailTime > 0 && tailTime < 1 ?
				Math.sin(tailTime * Math.PI * 2) * Math.sin(tailTime * Math.PI) * (interested ? 1 : .52) : 0;
			result.gesture = t < 860 ? 'listening' : t < 1_200 ? 'looking' : t < 3_300 ? 'tilting' : t >= 3_500 && t < 5_000 ? 'tail' : 'quiet';
		}
		// Blinks wait for the larger gesture to finish, rather than competing
		// with the ears and head. The occasional second blink has its own pause.
		if (!this.blink && !this.sequence && now >= this.nextBlink) {
			this.blink = { start: now, double: this.random() < .22 };
		}
		if (this.blink) {
			const elapsed = now - this.blink.start;
			const duration = this.blink.double ? 660 : 255;
			if (elapsed >= duration) {
				this.blink = undefined;
				this.nextBlink = now + this.between(4_500, 9_500);
			} else {
				result.blink = pulse(elapsed, 75, 110, 255);
				if (this.blink.double) result.blink = Math.max(result.blink, pulse(elapsed - 405, 75, 110, 255));
			}
		}
		this.wasAttentive = attentive;
		return result;
	}
}
