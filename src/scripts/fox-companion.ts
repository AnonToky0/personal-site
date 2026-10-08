import { FoxBehavior, type FoxMode } from './fox-behavior';
import { FOX_GUTTER_PADDING, isInSideGutter } from './fox-pointer';
import { getFoxHeadAngle } from './fox-gaze';

const STORAGE_KEY = 'personal-site:fox-collapsed:v1';
const MODES = new Set<FoxMode>(['auto', 'resting', 'sitting', 'sleeping', 'badge']);

class FoxCompanion extends HTMLElement {
	private behavior!: FoxBehavior;
	private events?: AbortController;
	private timer?: number;
	private frame?: number;
	private resizeObserver?: ResizeObserver;
	private toggle!: HTMLButtonElement;
	private butterfly!: HTMLElement;
	private butterflyImage!: HTMLImageElement;
	private rig?: HTMLElement;
	private rigImages: HTMLImageElement[] = [];
	private finePointer!: MediaQueryList;
	private boundary!: HTMLElement;
	private pointer = { x: 0, y: 0 };
	private lastView = '';

	connectedCallback() {
		if (this.events) return;
		this.toggle = this.querySelector<HTMLButtonElement>('[data-fox-toggle]')!;
		this.butterfly = this.querySelector<HTMLElement>('[data-butterfly]')!;
		this.butterflyImage = this.butterfly.querySelector<HTMLImageElement>('img')!;
		this.rig = this.querySelector<HTMLElement>('[data-fox-rig]') ?? undefined;
		this.rigImages = Array.from(this.rig?.querySelectorAll<HTMLImageElement>('img') ?? []);
		if (!this.toggle || !this.butterflyImage) return;
		this.events = new AbortController();
		this.boundary = document.querySelector<HTMLElement>('[data-fox-boundary]') ?? document.body;
		const signal = this.events.signal;
		const now = performance.now();
		this.behavior = new FoxBehavior(now);
		this.finePointer = matchMedia('(hover: hover) and (pointer: fine)');
		const reduced = matchMedia('(prefers-reduced-motion: reduce)');
		this.behavior.reducedMotion = reduced.matches;
		if (this.dataset.persist !== 'false') {
			try { this.behavior.collapsed = localStorage.getItem(STORAGE_KEY) === 'true'; } catch { /* Storage is optional. */ }
		}
		this.toggle.disabled = false;
		this.dataset.ready = 'true';

		this.toggle.addEventListener('click', () => {
			const now = performance.now();
			this.behavior.setCollapsed(this.behavior.view(now).state !== 'badge', now);
			if (this.dataset.persist !== 'false') {
				try { localStorage.setItem(STORAGE_KEY, String(this.behavior.collapsed)); } catch { /* Private browsing still works. */ }
			}
			this.dispatchEvent(new CustomEvent('fox:mode', { detail: { mode: 'auto' } }));
			this.render();
		}, { signal });
		this.toggle.addEventListener('focus', () => {
			this.behavior.setFocus(this.toggle.matches(':focus-visible'), performance.now());
			this.render();
		}, { signal });
		this.toggle.addEventListener('blur', () => {
			this.behavior.setFocus(false, performance.now());
			this.render();
		}, { signal });

		const handlePointer = (event: PointerEvent) => {
			const now = performance.now();
			if (event.pointerType !== 'mouse' || !this.finePointer.matches) {
				this.behavior.leavePointer();
				this.behavior.activity(now);
				this.queueRender();
				return;
			}
			if (!this.behavior.active && !document.hidden) this.setActive(true);
			this.pointer = { x: event.clientX, y: event.clientY };
			this.behavior.pointer(now, this.behavior.near, this.behavior.inSideGutter);
			this.queueRender();
		};
		document.addEventListener('pointermove', handlePointer, { signal, passive: true });
		// A tap on a hybrid touch/mouse device may have no pointermove. Process
		// pointerdown too so it cannot leave a mouse-only butterfly behind.
		document.addEventListener('pointerdown', handlePointer, { signal, passive: true });
		document.addEventListener('pointerout', (event) => {
			if (event.relatedTarget !== null) return;
			this.behavior.leavePointer();
			this.render();
		}, { signal });
		const activity = () => { this.behavior.activity(performance.now()); this.queueRender(); };
		document.addEventListener('keydown', activity, { signal });
		window.addEventListener('scroll', activity, { signal, passive: true });
		window.addEventListener('blur', () => this.setActive(false), { signal });
		window.addEventListener('focus', () => this.setActive(!document.hidden), { signal });
		document.addEventListener('visibilitychange', () => this.setActive(!document.hidden), { signal });
		window.addEventListener('pagehide', () => this.setActive(false), { signal });
		window.addEventListener('pageshow', () => this.setActive(!document.hidden), { signal });
		window.addEventListener('resize', () => this.queueRender(), { signal });
		reduced.addEventListener('change', () => {
			this.behavior.reducedMotion = reduced.matches;
			this.behavior.lookUntil = 0;
			this.render();
		}, { signal });
		this.finePointer.addEventListener('change', () => {
			this.behavior.leavePointer();
			this.render();
		}, { signal });
		window.addEventListener('storage', (event) => {
			if (this.dataset.persist === 'false' || event.key !== STORAGE_KEY) return;
			this.behavior.setCollapsed(event.newValue === 'true', performance.now());
			this.render();
		}, { signal });
		this.addEventListener('fox:preview', (event) => {
			if (this.dataset.preview !== 'true') return;
			const mode = (event as CustomEvent<{ mode: FoxMode }>).detail?.mode;
			if (!MODES.has(mode)) return;
			this.behavior.setMode(mode, performance.now());
			this.render();
		}, { signal });
		for (const image of [this.butterflyImage, ...this.rigImages]) {
			image.addEventListener('load', () => this.render(), { signal });
			image.addEventListener('error', () => this.render(), { signal });
		}
		this.resizeObserver = new ResizeObserver(() => this.queueRender());
		this.resizeObserver.observe(this.toggle);
		this.resizeObserver.observe(this.boundary);
		this.setActive(!document.hidden);
	}

	private setActive(active: boolean) {
		this.behavior.setActive(active, performance.now());
		window.clearInterval(this.timer);
		this.timer = undefined;
		if (active) this.timer = window.setInterval(() => {
			this.behavior.advance(performance.now());
			this.render();
		}, 400);
		this.render();
	}

	private queueRender() {
		if (this.frame !== undefined) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = undefined;
			this.render();
		});
	}

	private updatePointerRegion() {
		if (!this.behavior.pointerInside || !this.behavior.active) return;
		const { x, y } = this.pointer;
		const target = document.elementFromPoint(x, y);
		const control = target?.closest('a, button, input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"]');
		if (!target || (control && control !== this.toggle)) {
			this.behavior.setPointerRegion(false, false);
			return;
		}
		const rect = this.toggle.getBoundingClientRect();
		const boundary = this.boundary.getBoundingClientRect();
		const margin = this.behavior.near ? 110 : 72;
		const dx = Math.max(rect.left - x, 0, x - rect.right);
		const dy = Math.max(rect.top - y, 0, y - rect.bottom);
		// Only direct interaction with the fox can override the protected strip.
		const overContent = x >= boundary.left - FOX_GUTTER_PADDING &&
			x <= boundary.right + FOX_GUTTER_PADDING && !this.toggle.contains(target);
		const near = !overContent && Math.hypot(dx, dy) < margin;
		const inSideGutter = isInSideGutter(x, boundary, document.documentElement.clientWidth, this.behavior.inSideGutter);
		this.behavior.setPointerRegion(near, inSideGutter);
	}

	private render() {
		this.updatePointerRegion();
		const view = this.behavior.view(performance.now());
		this.dataset.state = view.state;
		this.dataset.mode = this.behavior.mode;
		this.toggle.setAttribute('aria-expanded', String(view.state !== 'badge'));
		const label = view.state === 'badge' ? '展开狐狸' : view.state === 'sleeping' ? '狐狸正在打盹，点击收起' : '收起狐狸';
		this.toggle.setAttribute('aria-label', label);
		this.toggle.title = label;
		const imageReady = this.butterflyImage.complete && this.butterflyImage.naturalWidth > 0;
		const butterflyMode = imageReady && this.behavior.active && this.finePointer.matches ? view.butterfly : 'hidden';
		this.dataset.butterfly = butterflyMode;
		document.documentElement.classList.toggle('fox-cursor-active', butterflyMode === 'following');
		this.butterfly.hidden = butterflyMode === 'hidden';
		const rigReady = this.rigImages.length > 0 &&
			this.rigImages.every(image => image.complete && image.naturalWidth > 0);
		if (this.rig) this.rig.dataset.ready = String(rigReady);
		let headAngle = 0;
		if (butterflyMode !== 'hidden') {
			const x = Math.max(26, Math.min(innerWidth - 26, this.pointer.x));
			const y = Math.max(26, Math.min(innerHeight - 26, this.pointer.y));
			this.butterfly.style.transform = 'translate3d(' + (x - 24) + 'px,' + (y - 24) + 'px,0) rotate(-12deg)';
			if (rigReady && !this.behavior.reducedMotion && view.state === 'sitting') {
				headAngle = getFoxHeadAngle({ x, y }, this.toggle.getBoundingClientRect());
			}
		}
		this.style.setProperty('--fox-head-angle', headAngle.toFixed(2) + 'deg');
		const key = view.state + ':' + butterflyMode + ':' + this.behavior.mode;
		if (key !== this.lastView) {
			this.lastView = key;
			this.dispatchEvent(new CustomEvent('fox:state', { detail: { ...view, butterfly: butterflyMode, mode: this.behavior.mode } }));
		}
	}

	disconnectedCallback() {
		this.events?.abort();
		this.events = undefined;
		window.clearInterval(this.timer);
		if (this.frame !== undefined) cancelAnimationFrame(this.frame);
		this.frame = undefined;
		this.resizeObserver?.disconnect();
		document.documentElement.classList.remove('fox-cursor-active');
	}
}

if (!customElements.get('fox-companion')) customElements.define('fox-companion', FoxCompanion);
