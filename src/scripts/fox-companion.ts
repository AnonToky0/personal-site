import { FoxBehavior, type FoxMode } from './fox-behavior';

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
	private finePointer!: MediaQueryList;
	private pointer = { x: 0, y: 0 };
	private lastView = '';

	connectedCallback() {
		if (this.events) return;
		this.toggle = this.querySelector<HTMLButtonElement>('[data-fox-toggle]')!;
		this.butterfly = this.querySelector<HTMLElement>('[data-butterfly]')!;
		this.butterflyImage = this.butterfly.querySelector<HTMLImageElement>('img')!;
		if (!this.toggle || !this.butterflyImage) return;
		this.events = new AbortController();
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

		document.addEventListener('pointermove', (event) => {
			const now = performance.now();
			if (event.pointerType !== 'mouse' || !this.finePointer.matches) {
				this.behavior.leavePointer();
				this.behavior.activity(now);
				this.queueRender();
				return;
			}
			if (!this.behavior.active && !document.hidden) this.setActive(true);
			this.pointer = { x: event.clientX, y: event.clientY };
			const rect = this.toggle.getBoundingClientRect();
			const margin = this.behavior.near ? 110 : 72;
			const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
			const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
			const near = this.behavior.view(now).state !== 'badge' && Math.hypot(dx, dy) < margin;
			this.behavior.pointer(now, near);
			this.queueRender();
		}, { signal, passive: true });
		document.addEventListener('pointerout', (event) => {
			if (event.relatedTarget !== null) return;
			this.behavior.leavePointer();
			this.render();
		}, { signal });
		const activity = () => { this.behavior.activity(performance.now()); this.queueRender(); };
		document.addEventListener('pointerdown', activity, { signal, passive: true });
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
		this.butterflyImage.addEventListener('load', () => this.render(), { signal });
		this.resizeObserver = new ResizeObserver(() => this.queueRender());
		this.resizeObserver.observe(this.toggle);
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

	private render() {
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
		if (butterflyMode !== 'hidden') {
			const x = Math.max(26, Math.min(innerWidth - 26, this.pointer.x));
			const y = Math.max(26, Math.min(innerHeight - 26, this.pointer.y));
			this.butterfly.style.transform = 'translate3d(' + (x - 24) + 'px,' + (y - 24) + 'px,0) rotate(-12deg)';
		}
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
