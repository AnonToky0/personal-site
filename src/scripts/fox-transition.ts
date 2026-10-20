import { motionDuration, sampleMotion, type FoxClipId } from './fox-motion.ts';
import type { FoxPose } from './fox-behavior.ts';

type State = FoxPose | 'badge';
const links = {
	rise: { from: 'resting', to: 'sitting' },
	lie: { from: 'sitting', to: 'resting' },
	sleep: { from: 'resting', to: 'sleeping' },
	wake: { from: 'sleeping', to: 'resting' },
} as const;
export const HEAD_RETURN_MS = 180;

export function nextFoxClip(from: FoxPose, to: FoxPose): FoxClipId | undefined {
	if (from === to) return;
	if (from === 'sitting') return 'lie';
	if (from === 'sleeping') return 'wake';
	return to === 'sitting' ? 'rise' : 'sleep';
}

/** Keeps the current gesture intact while retaining only the newest request.
 * Badge, unavailable artwork, reduced motion and lifecycle suspension snap
 * immediately; ordinary changes finish at an original pose before continuing.
 */
export class FoxTransition {
	private state: State;
	private clip?: { id: FoxClipId; start: number; lead: number };
	constructor(initial: State = 'resting') { this.state = initial; }

	snap(state: State) { this.state = state; this.clip = undefined; }

	update(target: State, now: number, animate = true) {
		if (!animate || target === 'badge' || this.state === 'badge') this.snap(target);
		if (this.clip && now >= this.clip.start + this.clip.lead + motionDuration(this.clip.id)) {
			this.state = links[this.clip.id].to;
			this.clip = undefined;
		}
		if (!this.clip && this.state !== target && this.state !== 'badge' && target !== 'badge') {
			const id = nextFoxClip(this.state, target)!;
			this.clip = { id, start: now, lead: this.state === 'sitting' ? HEAD_RETURN_MS : 0 };
		}
		if (!this.clip) return { pose: this.state, frame: null, moving: false, clip: null };
		const { id, start, lead } = this.clip;
		const sample = sampleMotion(id, Math.max(0, now - start - lead));
		const column = sample.frame % 8;
		return {
			// Endpoints use the original DOM artwork, not a regenerated sprite.
			pose: column === 7 ? links[id].to : links[id].from,
			frame: column === 0 || column === 7 ? null : sample.frame,
			moving: true,
			clip: id,
		};
	}
}
