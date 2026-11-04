const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Horizontal direction is separate from the existing up/down head pitch. */
export function getHeadTurnTarget(pointerX: number, fox: { left: number; width: number }) {
	const dx = pointerX - (fox.left + fox.width * .38);
	const angle = Math.atan2(dx, Math.max(1, fox.width * .32)) * 180 / Math.PI;
	return clamp((angle + 80) / 20, 0, 8);
}

export function getHeadTurnPitch(pitch: number, frame: number) {
	// Restrained shoulder-led pitch; a frontal face has no sideways roll.
	return clamp(pitch, -22, 22) * (7 / 22) * (1 - clamp(frame, 0, 8) / 4);
}

/** A reversible turn that preserves its current position when retargeted. */
export class FoxHeadTurn {
	private current = 0;
	private target = 0;
	private frame = 0;
	private lastTime?: number;
	aim(target: number, now: number) {
		this.update(now);
		if (Math.abs(target - this.target) >= .15) this.target = clamp(target, 0, 8);
	}
	update(now: number) {
		const dt = Math.min(64, Math.max(0, now - (this.lastTime ?? now)));
		this.lastTime = now;
		const delta = this.target - this.current;
		this.current += clamp(delta * (1 - Math.exp(-dt / 100)), -dt * .014, dt * .014);
		const moving = Math.abs(this.target - this.current) > .025;
		if (!moving) { this.current = this.target; this.frame = Math.round(this.target); }
		else if (Math.abs(this.current - this.frame) > .6) this.frame = Math.round(this.current);
		return { frame: this.frame, moving };
	}
	seek(frame: number) {
		this.current = this.target = this.frame = clamp(Math.round(frame), 0, 8);
		this.lastTime = undefined;
	}
	cancel(now: number) { this.seek(this.update(now).frame); }
}
