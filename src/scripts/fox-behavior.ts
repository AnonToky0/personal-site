export type FoxPose = 'resting' | 'sitting' | 'sleeping';
export type FoxMode = 'auto' | FoxPose | 'badge';
export type FoxView = { state: FoxPose | 'badge'; butterfly: 'hidden' | 'following' };

export const FOX_TIMING = {
	idle: 90_000,
	lookMin: 18_000,
	lookMax: 38_000,
	lookDuration: 2_800,
};

/** Time is supplied by the controller so idle and interrupted gestures are deterministic. */
export class FoxBehavior {
	collapsed = false;
	mode: FoxMode = 'auto';
	reducedMotion = false;
	active = true;
	pointerInside = false;
	near = false;
	inSideGutter = false;
	focused = false;
	lastActivity: number;
	lookUntil = 0;
	nextLook: number;
	private random: () => number;

	constructor(now: number, random = Math.random) {
		this.random = random;
		this.lastActivity = now;
		this.nextLook = this.scheduleLook(now);
	}

	private scheduleLook(now: number) {
		return now + FOX_TIMING.lookMin + this.random() * (FOX_TIMING.lookMax - FOX_TIMING.lookMin);
	}

	activity(now: number) {
		// Start a fresh quiet interval when waking from sleep.
		if (now - this.lastActivity >= FOX_TIMING.idle) {
			this.nextLook = this.scheduleLook(now);
			this.setPointerRegion(false, false);
			this.lookUntil = 0;
		}
		this.lastActivity = now;
	}

	pointer(now: number, near: boolean, inSideGutter = false) {
		this.activity(now);
		this.pointerInside = true;
		this.setPointerRegion(near, inSideGutter);
	}

	// Layout changes may move the boundary beneath a stationary pointer. Updating
	// its region must not count as activity or postpone the idle sleep timer.
	setPointerRegion(near: boolean, inSideGutter: boolean) {
		this.near = near;
		this.inSideGutter = inSideGutter;
		if (near || inSideGutter) this.lookUntil = 0;
	}

	leavePointer() {
		this.pointerInside = false;
		this.setPointerRegion(false, false);
	}

	setFocus(focused: boolean, now: number) {
		this.focused = focused;
		if (focused) this.activity(now);
	}

	setCollapsed(collapsed: boolean, now: number) {
		this.collapsed = collapsed;
		this.mode = 'auto';
		this.setPointerRegion(false, false);
		this.lookUntil = 0;
		this.activity(now);
		this.nextLook = this.scheduleLook(now);
	}

	setMode(mode: FoxMode, now: number) {
		this.mode = mode;
		this.setPointerRegion(false, false);
		this.lookUntil = 0;
		this.activity(now);
	}

	setActive(active: boolean, now: number) {
		this.active = active;
		this.setPointerRegion(false, false);
		this.pointerInside = false;
		this.lookUntil = 0;
		if (active) {
			this.activity(now);
			this.nextLook = this.scheduleLook(now);
		}
	}

	advance(now: number) {
		if (!this.active || now < this.nextLook) return;
		const awake = now - this.lastActivity < FOX_TIMING.idle;
		if (this.mode === 'auto' && !this.collapsed && this.pointerInside && awake &&
			!this.near && !this.inSideGutter && !this.focused && !this.reducedMotion) {
			this.lookUntil = now + FOX_TIMING.lookDuration;
		}
		this.nextLook = this.scheduleLook(now);
	}

	view(now: number): FoxView {
		if (this.mode !== 'auto') return { state: this.mode, butterfly: 'hidden' };
		if (this.collapsed) return { state: 'badge', butterfly: 'hidden' };
		if (now - this.lastActivity >= FOX_TIMING.idle) return { state: 'sleeping', butterfly: 'hidden' };
		if (!this.active) return { state: 'resting', butterfly: 'hidden' };
		if ((this.near || this.inSideGutter) && this.pointerInside) {
			return { state: 'sitting', butterfly: 'following' };
		}
		return { state: this.focused || now < this.lookUntil ? 'sitting' : 'resting', butterfly: 'hidden' };
	}
}
