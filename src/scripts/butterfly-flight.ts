import { ButterflyMotion } from './butterfly-motion';

class ButterflyFlight extends HTMLElement {
	static observedAttributes = ['data-active', 'data-paused'];
	private events?: AbortController;
	private observer?: IntersectionObserver;
	private frame?: number;
	private motion = new ButterflyMotion();
	private reduced?: MediaQueryList;
	private active = true;
	private inView = false;
	private lastPaint = -Infinity;

	connectedCallback() {
		if (this.events) return;
		this.events = new AbortController();
		const { signal } = this.events;
		this.motion = new ButterflyMotion();
		this.lastPaint = -Infinity;
		this.active = !document.hidden;
		this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
		this.reduced.addEventListener('change', this.sync, { signal });
		window.addEventListener('scroll', () => {
			if (this.enabled) this.motion.scroll(performance.now());
		}, { signal, passive: true });
		const activate = () => { this.active = !document.hidden; this.sync(); };
		const suspend = () => { this.active = false; this.sync(); };
		document.addEventListener('visibilitychange', activate, { signal });
		window.addEventListener('focus', activate, { signal });
		window.addEventListener('blur', suspend, { signal });
		window.addEventListener('pageshow', activate, { signal });
		window.addEventListener('pagehide', suspend, { signal });
		if (this.dataset.preview === 'true') {
			this.observer = new IntersectionObserver(entries => {
				this.inView = entries.some(entry => entry.isIntersecting);
				this.sync();
			});
			this.observer.observe(this);
		}
		this.sync();
	}

	attributeChangedCallback() { this.sync(); }
	private get enabled() {
		return !!this.events && this.active && !this.reduced?.matches && this.dataset.paused !== 'true' &&
			(this.dataset.preview === 'true' ? this.inView : this.dataset.active === 'true');
	}
	private sync = () => {
		if (this.enabled) {
			if (this.frame === undefined) this.paint(performance.now());
		} else {
			if (this.frame !== undefined) cancelAnimationFrame(this.frame);
			this.frame = undefined;
			this.motion.update(performance.now(), false);
			this.style.removeProperty('--butterfly-left');
			this.style.removeProperty('--butterfly-right');
			this.style.removeProperty('--butterfly-float');
			this.dataset.motion = 'still';
		}
	};
	private paint = (now: number) => {
		this.frame = undefined;
		if (!this.enabled) return;
		if (now - this.lastPaint >= 1_000 / 30) {
			this.lastPaint = now;
			const sample = this.motion.update(now, true);
			this.style.setProperty('--butterfly-left', sample.angle.toFixed(2) + 'deg');
			this.style.setProperty('--butterfly-right', (-sample.angle).toFixed(2) + 'deg');
			this.style.setProperty('--butterfly-float', sample.float.toFixed(2) + 'px');
			this.dataset.motion = sample.energy > .05 ? 'fluttering' : 'gentle';
		}
		this.frame = requestAnimationFrame(this.paint);
	};
	disconnectedCallback() {
		this.events?.abort(); this.events = undefined;
		this.observer?.disconnect(); this.observer = undefined;
		this.inView = false;
		this.sync();
	}
}

if (!customElements.get('butterfly-flight')) customElements.define('butterfly-flight', ButterflyFlight);
