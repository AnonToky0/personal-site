import { FOX_CLIPS, frameTime, motionDuration, motionSteps, sampleMotion, motionFramePose, type FoxSequence } from './fox-motion';

class FoxMotionPreview extends HTMLElement {
	private events?: AbortController;
	private observer?: IntersectionObserver;
	private raf?: number;
	private sequence: FoxSequence = 'all';
	private elapsed = 0;
	private speed = 1;
	private playing = false;
	private ready = false;
	private visible = false;
	private autoStarted = false;
	private previousTime = 0;
	private lastFrame = -1;
	private lastRow = -1;
	private reduced!: MediaQueryList;
	private sprites: HTMLElement[] = [];
	private thumbnails: HTMLButtonElement[] = [];
	private progress!: HTMLInputElement;
	private playButton!: HTMLButtonElement;
	private notice!: HTMLElement;

	connectedCallback() {
		if (this.events) return;
		this.events = new AbortController();
		const { signal } = this.events;
		this.sprites = Array.from(this.querySelectorAll('[data-motion-sprite]'));
		this.thumbnails = Array.from(this.querySelectorAll('[data-motion-frame]'));
		this.progress = this.querySelector('[data-motion-progress]')!;
		this.playButton = this.querySelector('[data-motion-play]')!;
		this.notice = this.querySelector('[data-motion-notice]')!;
		this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
		const atlas = this.querySelector<HTMLImageElement>('[data-motion-atlas]')!;
		const loaded = () => {
			if (!atlas.naturalWidth) return;
			this.ready = true;
			this.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('[disabled]').forEach(control => control.disabled = false);
			this.updateNotice();
			this.maybeAutoplay();
		};
		atlas.addEventListener('load', loaded, { signal });
		atlas.addEventListener('error', () => {
			this.pause();
			this.ready = false;
			this.notice.textContent = '动作素材暂时没有加载成功，请刷新页面重试。原始三种姿态仍可在下方查看。';
		}, { signal });
		this.playButton.addEventListener('click', () => this.playing ? this.pause() : this.play(), { signal });
		this.querySelector('[data-motion-restart]')!.addEventListener('click', () => { this.elapsed = 0; this.play(); }, { signal });
		this.querySelectorAll<HTMLButtonElement>('[data-clip]').forEach(button => button.addEventListener('click', () => {
			this.pause();
			this.sequence = button.dataset.clip as FoxSequence;
			this.elapsed = 0;
			this.lastFrame = -1;
			this.lastRow = -1;
			this.draw();
			if (!this.reduced.matches) this.play();
		}, { signal }));
		this.querySelector<HTMLSelectElement>('[data-motion-speed]')!.addEventListener('change', event => {
			this.speed = Number((event.target as HTMLSelectElement).value);
			this.previousTime = performance.now();
		}, { signal });
		this.querySelector<HTMLSelectElement>('[data-motion-background]')!.addEventListener('change', event => {
			this.dataset.background = (event.target as HTMLSelectElement).value;
		}, { signal });
		this.progress.addEventListener('input', () => { this.pause(); this.elapsed = Number(this.progress.value); this.draw(); }, { signal });
		this.thumbnails.forEach((button, i) => button.addEventListener('click', () => {
			this.pause();
			const current = sampleMotion(this.sequence, this.elapsed);
			const clip = FOX_CLIPS.find(clip => clip.id === current.clip)!;
			this.elapsed = frameTime(this.sequence, clip.row * 8 + i);
			this.draw();
		}, { signal }));
		this.querySelector('[data-motion-prev]')!.addEventListener('click', () => this.step(-1), { signal });
		this.querySelector('[data-motion-next]')!.addEventListener('click', () => this.step(1), { signal });
		this.reduced.addEventListener('change', () => { this.pause(); this.updateNotice(); }, { signal });
		document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); }, { signal });
		this.observer = new IntersectionObserver(entries => {
			this.visible = entries[0].isIntersecting;
			this.dataset.inView = String(this.visible);
			if (!this.visible) this.pause();
			else this.maybeAutoplay();
		}, { threshold: 0 });
		this.observer.observe(this);
		this.draw();
		if (atlas.complete) {
			if (atlas.naturalWidth) loaded();
			else this.notice.textContent = '动作素材暂时没有加载成功，请刷新页面重试。';
		}
	}

	private updateNotice() {
		this.notice.textContent = this.reduced.matches ? '已开启“减少动态效果”。可以逐帧查看，或主动点击播放。' : '先看一遍完整日常，也可以选中单段动作慢放。';
	}
	private maybeAutoplay() {
		if (!this.ready || !this.visible || this.autoStarted || this.reduced.matches || document.hidden) return;
		this.autoStarted = true;
		this.play();
	}
	private play() {
		if (!this.ready || document.hidden) return;
		this.autoStarted = true;
		if (this.elapsed >= motionDuration(this.sequence)) this.elapsed = 0;
		this.playing = true;
		this.previousTime = performance.now();
		if (this.raf !== undefined) cancelAnimationFrame(this.raf);
		this.draw();
		this.raf = requestAnimationFrame(time => this.tick(time));
	}
	private pause() {
		this.playing = false;
		if (this.raf !== undefined) cancelAnimationFrame(this.raf);
		this.raf = undefined;
		if (this.playButton) this.draw();
	}
	private tick(now: number) {
		this.raf = undefined;
		if (!this.playing) return;
		this.elapsed += Math.max(0, now - this.previousTime) * this.speed;
		this.previousTime = now;
		const duration = motionDuration(this.sequence);
		if (this.elapsed >= duration) {
			if (this.querySelector<HTMLInputElement>('[data-motion-loop]')!.checked) this.elapsed %= duration;
			else { this.elapsed = duration; this.playing = false; }
		}
		this.draw();
		if (this.playing) this.raf = requestAnimationFrame(time => this.tick(time));
	}
	private step(direction: number) {
		this.pause();
		const steps = motionSteps(this.sequence);
		const sample = sampleMotion(this.sequence, this.elapsed);
		let index = sample.index + direction;
		while (index >= 0 && index < steps.length && (steps[index].hold || steps[index].frame === sample.frame)) index += direction;
		if (index < 0) this.elapsed = 0;
		else if (index >= steps.length) this.elapsed = motionDuration(this.sequence);
		else this.elapsed = steps.slice(0, index).reduce((sum, step) => sum + step.duration, 0);
		this.draw();
	}
	private draw() {
		const sample = sampleMotion(this.sequence, this.elapsed);
		const clip = FOX_CLIPS.find(clip => clip.id === sample.clip)!;
		const column = sample.frame % 8;
		if (sample.frame !== this.lastFrame) {
			this.sprites.forEach(sprite => {
				sprite.style.backgroundPosition = `${column / 7 * 100}% ${clip.row / 3 * 100}%`;
				sprite.dataset.endpoint = motionFramePose(sample.frame) ?? 'none';
				sprite.setAttribute('aria-label', `绘本狐狸：${sample.beat}`);
			});
			this.thumbnails.forEach((button, i) => button.setAttribute('aria-current', String(i === column)));
			this.lastFrame = sample.frame;
		}
		if (clip.row !== this.lastRow) {
			this.thumbnails.forEach((button, i) => {
				button.querySelector<HTMLElement>('.frame-sprite')!.style.backgroundPosition = `${i / 7 * 100}% ${clip.row / 3 * 100}%`;
				button.setAttribute('aria-label', `${clip.title}，第 ${i + 1} 帧：${clip.beats[i]}`);
			});
			this.querySelector('[data-frame-title]')!.textContent = clip.title;
			this.querySelectorAll<HTMLElement>('[data-path]').forEach(item => item.setAttribute('aria-current', item.dataset.path === clip.id ? 'step' : 'false'));
			this.lastRow = clip.row;
		}
		this.querySelector('[data-motion-beat]')!.textContent = sample.beat;
		this.querySelector('[data-motion-title]')!.textContent = this.sequence === 'all' ? '完整日常' : clip.title;
		this.querySelector('[data-motion-state]')!.textContent = this.playing ? (sample.hold ? '停留片刻' : '动作进行中') : sample.ended ? '播放完毕' : '已暂停';
		this.querySelectorAll<HTMLButtonElement>('[data-clip]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.clip === this.sequence)));
		this.progress.max = String(sample.duration);
		this.progress.value = String(Math.round(sample.elapsed));
		this.progress.setAttribute('aria-valuetext', `${clip.title}，${sample.beat}，${(sample.elapsed / 1000).toFixed(1)} 秒`);
		this.querySelector('[data-motion-time]')!.textContent = `${(sample.elapsed / 1000).toFixed(1)} / ${(sample.duration / 1000).toFixed(1)} s`;
		this.playButton.textContent = this.playing ? '暂停' : sample.ended ? '再看一遍' : '播放';
	}
	disconnectedCallback() {
		this.pause();
		delete this.dataset.inView;
		this.events?.abort();
		this.events = undefined;
		this.observer?.disconnect();
	}
}

if (!customElements.get('fox-motion-preview')) customElements.define('fox-motion-preview', FoxMotionPreview);
