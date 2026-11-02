import { getFoxHeadAngle } from './fox-gaze';
import { FoxIdleArt } from './fox-idle-art';
import { FoxIdle, type IdleCue } from './fox-idle';

const targets = {
	up: { x: .10, y: .03, label: '轻轻看向左上方' },
	down: { x: .05, y: .70, label: '轻轻看向左下方' },
	behind: { x: .90, y: .10, label: '蝴蝶飞到身后，狐狸自然回正' },
};

class FoxGazePreview extends HTMLElement {
	private events?: AbortController;
	private frame?: number;
	private resize?: ResizeObserver;
	private artist?: FoxIdleArt;
	private idle = new FoxIdle();
	private reduced!: MediaQueryList;
	private angle = 0;
	private target = 0;
	private lastTime = 0;
	private cueUntil = 0;
	connectedCallback() {
		if (this.events) return;
		this.events = new AbortController();
		const { signal } = this.events;
		this.artist = new FoxIdleArt(this.querySelector('[data-idle-art]')!);
		this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
		this.idle = new FoxIdle();
		this.lastTime = performance.now();
		this.querySelectorAll<HTMLButtonElement>('[data-gaze-target]').forEach(button => button.addEventListener('click', () => {
			const key = button.dataset.gazeTarget as keyof typeof targets;
			const point = targets[key];
			this.target = point ? getFoxHeadAngle(point, { left: 0, top: 0, width: 1, height: 1 }) : 0;
			const visitor = this.querySelector<HTMLElement>('[data-gaze-butterfly]')!;
			visitor.hidden = !point;
			if (point) { visitor.style.left = `${point.x * 100}%`; visitor.style.top = `${point.y * 100}%`; }
			this.querySelector('output')!.textContent = point?.label ?? '保持原来的侧脸，放松一会儿';
			this.paint();
		}, { signal }));
		this.querySelectorAll<HTMLButtonElement>('[data-gaze-cue]').forEach(button => button.addEventListener('click', () => {
			if (this.reduced.matches) return;
			const now = performance.now();
			const cue = button.dataset.gazeCue as IdleCue;
			this.idle.cue(now, cue);
			this.cueUntil = now + (cue === 'blink' ? 280 : 5_200);
			this.paint();
		}, { signal }));
		this.querySelectorAll('img').forEach(image => image.addEventListener('load', this.paint, { signal }));
		this.querySelector('canvas')!.addEventListener('webglcontextrestored', this.paint, { signal });
		const stop = () => { this.target = this.angle = this.cueUntil = 0; this.paint(); };
		window.addEventListener('blur', stop, { signal });
		window.addEventListener('pagehide', stop, { signal });
		document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, { signal });
		this.reduced.addEventListener('change', stop, { signal });
		this.resize = new ResizeObserver(this.paint);
		this.resize.observe(this.querySelector('.fox')!);
		this.paint();
	}
	private paint = () => {
		if (this.frame !== undefined) cancelAnimationFrame(this.frame);
		this.frame = undefined;
		if (!this.events) return;
		const now = performance.now();
		const dt = Math.min(100, Math.max(0, now - this.lastTime));
		this.lastTime = now;
		const enabled = !this.reduced.matches && !document.hidden;
		const sample = this.idle.update(now, { pose: 'sitting', enabled, attentive: false });
		if (!enabled) this.angle = 0;
		else this.angle += (this.target - this.angle) * (1 - Math.exp(-dt / 180));
		const cue = enabled && now < this.cueUntil;
		const pitch = Math.max(-4, Math.min(4, this.angle + (cue ? sample.head * .25 : 0)));
		this.artist?.draw({ ...sample, breath: 0, blink: cue ? sample.blink : 0, nearEar: cue ? sample.nearEar : 0, farEar: cue ? sample.farEar : 0, tail: 0 }, this.querySelector('.fox')!.getBoundingClientRect().width, pitch);
		if (enabled && (Math.abs(this.target - this.angle) > .01 || cue)) this.frame = requestAnimationFrame(this.paint);
	};
	disconnectedCallback() {
		this.events?.abort(); this.events = undefined;
		if (this.frame !== undefined) cancelAnimationFrame(this.frame);
		this.frame = undefined;
		this.resize?.disconnect(); this.resize = undefined;
		this.artist?.dispose(); this.artist = undefined;
	}
}
if (!customElements.get('fox-gaze-preview')) customElements.define('fox-gaze-preview', FoxGazePreview);
