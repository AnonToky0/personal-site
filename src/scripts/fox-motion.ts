export const FOX_CLIPS = [
	{ id: 'rise', title: '坐起来', from: '趴卧', to: '坐姿', row: 0, timing: [140, 120, 100, 95, 100, 110, 125, 210], beats: ['注意到了', '竖耳抬头', '前爪收近', '撑起胸口', '重心后移', '前腿伸直', '轻轻坐稳', '坐好了'] },
	{ id: 'lie', title: '趴下来', from: '坐姿', to: '趴卧', row: 1, timing: [140, 120, 120, 125, 125, 120, 120, 230], beats: ['准备趴下', '低头看一眼', '前爪前伸', '弯曲前腿', '胸口降低', '身体落地', '调整前爪', '放松趴卧'] },
	{ id: 'sleep', title: '睡着了', from: '趴卧', to: '睡眠', row: 2, timing: [220, 240, 240, 180, 180, 180, 220, 340], beats: ['有点困了', '眼皮变沉', '收拢前爪', '回头找尾巴', '尾巴围过来', '慢慢伏下', '闭上眼睛', '安心睡着'] },
	{ id: 'wake', title: '醒过来', from: '睡眠', to: '趴卧', row: 3, timing: [220, 200, 160, 160, 180, 180, 140, 260], beats: ['听见动静', '耳朵先醒', '睁眼看看', '抬起脑袋', '转头看过来', '伸出前爪', '放松身体', '醒来啦'] },
] as const;
export type FoxClipId = typeof FOX_CLIPS[number]['id'];
export type FoxSequence = 'all' | FoxClipId;
export function motionFramePose(frame: number): 'resting' | 'sitting' | 'sleeping' | null {
	const endpoints = [['resting', 'sitting'], ['sitting', 'resting'], ['resting', 'sleeping'], ['sleeping', 'resting']] as const;
	const column = frame % 8;
	if (column !== 0 && column !== 7) return null;
	return endpoints[Math.floor(frame / 8)]?.[column === 0 ? 0 : 1] ?? null;
}
export type MotionStep = { frame: number; duration: number; clip: FoxClipId; beat: string; hold: boolean };

function clipSteps(id: FoxClipId): MotionStep[] {
	const clip = FOX_CLIPS.find(clip => clip.id === id)!;
	return clip.timing.map((duration, i) => ({ frame: clip.row * 8 + i, duration, clip: id, beat: clip.beats[i], hold: false }));
}
const hold = (frame: number, duration: number, clip: FoxClipId, beat: string): MotionStep => ({ frame, duration, clip, beat, hold: true });
export function motionSteps(sequence: FoxSequence): MotionStep[] {
	if (sequence !== 'all') return clipSteps(sequence);
	return [hold(0, 900, 'rise', '安静地陪你一会儿'), ...clipSteps('rise'), hold(7, 1500, 'rise', '坐着看看四周'),
		...clipSteps('lie'), hold(15, 800, 'lie', '趴下来歇歇'), ...clipSteps('sleep'),
		hold(23, 1800, 'sleep', '做一个小小的梦'), ...clipSteps('wake'), hold(31, 900, 'wake', '又是精神的一只狐狸')];
}
export function motionDuration(sequence: FoxSequence): number {
	return motionSteps(sequence).reduce((sum, step) => sum + step.duration, 0);
}
export function sampleMotion(sequence: FoxSequence, time: number) {
	const steps = motionSteps(sequence);
	const duration = steps.reduce((sum, step) => sum + step.duration, 0);
	const elapsed = Math.max(0, Math.min(duration, Number.isFinite(time) ? time : 0));
	let start = 0;
	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		if (elapsed < start + step.duration || i === steps.length - 1) return { ...step, index: i, start, elapsed, duration, ended: elapsed >= duration };
		start += step.duration;
	}
	throw new Error('Empty motion sequence');
}
export function frameTime(sequence: FoxSequence, frame: number): number {
	let time = 0;
	for (const step of motionSteps(sequence)) {
		if (step.frame === frame && !step.hold) return time;
		time += step.duration;
	}
	return 0;
}
