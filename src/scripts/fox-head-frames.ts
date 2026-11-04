// Complete shoulder poses, registered against the original seated lower body.
// Coordinates are local to a 418 px atlas cell; only the upper torso blends.
type HeadFrame = { left: number; top: number; eyes: [number, number, number, number]; ears: [number, number, number, number] };
export const HEAD_FRAMES: HeadFrame[] = [
	{ left: -.075, top: 0, eyes: [.397,.213,-1,0], ears: [.58,.17,.43,.12] },
	{ left: -.085, top: -.025, eyes: [.412,.249,.335,.225], ears: [.59,.18,.43,.12] },
	{ left: -.040, top: -.040, eyes: [.390,.278,.282,.270], ears: [.55,.18,.32,.13] },
	{ left: -.095, top: 0, eyes: [.533,.242,.416,.223], ears: [.63,.16,.43,.12] },
	{ left: -.090, top: .008, eyes: [.553,.244,.433,.244], ears: [.62,.16,.40,.15] },
	{ left: -.090, top: .003, eyes: [.488,.244,.596,.238], ears: [.40,.16,.62,.15] },
	{ left: -.095, top: .010, eyes: [.565,.220,.675,.219], ears: [.41,.16,.63,.15] },
	{ left: -.105, top: 0, eyes: [.600,.222,.696,.226], ears: [.44,.16,.67,.15] },
	{ left: -.095, top: -.006, eyes: [.577,.230,.665,.235], ears: [.43,.16,.65,.15] },
];
export function headFrameLayout(frame: number) {
	const index = Math.max(0, Math.min(8, Math.round(frame)));
	return { ...HEAD_FRAMES[index], index, size: .93 };
}
export function setHeadFrame(host: HTMLElement, frame: number) {
	const layout = headFrameLayout(frame);
	if (host.dataset.headFrame !== String(layout.index)) {
		host.dataset.headFrame = String(layout.index);
	}
	return layout;
}
