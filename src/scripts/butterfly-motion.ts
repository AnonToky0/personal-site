export type ButterflySample = { angle: number; float: number; energy: number };

/** Integrate the wing phase instead of changing a CSS animation duration:
 * scrolling can then speed up a beat without jumping to a different pose. */
export class ButterflyMotion {
	private running = false;
	private lastTime = 0;
	private phase = 0;
	private floatPhase = 0;
	private energy = 0;
	private scrollUntil = -Infinity;

	scroll(now: number) {
		if (this.running) this.scrollUntil = now + 100;
	}

	update(now: number, enabled: boolean): ButterflySample {
		if (!enabled) {
			this.running = false;
			this.phase = this.floatPhase = this.energy = 0;
			this.scrollUntil = -Infinity;
			return { angle: 0, float: 0, energy: 0 };
		}
		if (!this.running) { this.running = true; this.lastTime = now; }
		// A suspended tab never catches up by skipping several wing beats.
		const dt = Math.min(64, Math.max(0, now - this.lastTime));
		this.lastTime = now;
		const scrolling = now < this.scrollUntil;
		const target = scrolling ? 1 : 0;
		this.energy += (target - this.energy) * (1 - Math.exp(-dt / (scrolling ? 140 : 320)));
		this.phase = (this.phase + dt / 1_000 * Math.PI * 2 * (1.15 + this.energy * 1.65)) % (Math.PI * 2);
		this.floatPhase = (this.floatPhase + dt / 1_000 * Math.PI * 2 / 1.8) % (Math.PI * 2);
		return {
			angle: (1 - Math.cos(this.phase)) / 2 * (32 + 26 * this.energy),
			float: Math.sin(this.floatPhase) * this.energy * 1.8,
			energy: this.energy,
		};
	}
}
