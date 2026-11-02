type Point = { x: number; y: number };
type FoxBounds = { left: number; top: number; width: number; height: number };

export const FOX_HEAD_LIMITS = { down: -3, up: 4 };

/** Attention fades across the shoulder instead of tracking behind a side-facing fox. */
export function getFoxAttentionWeight(pointerX: number, fox: FoxBounds): number {
	const dx = (pointerX - fox.left) / Math.max(1, fox.width) - .38;
	const t = Math.max(0, Math.min(1, (dx + .05) / .20));
	return 1 - t * t * (3 - 2 * t);
}

/** Gentle 2D pitch of the approved left-facing head, not a full turn of the face. */
export function getFoxHeadAngle(pointer: Point, fox: FoxBounds): number {
	const dx = pointer.x - (fox.left + fox.width * 0.38);
	const dy = pointer.y - (fox.top + fox.height * 0.30);
	// Near the neck, tiny pointer movements should not flip the head's direction.
	if (Math.hypot(dx, dy) < fox.width * 0.15) return 0;
	const attention = getFoxAttentionWeight(pointer.x, fox);
	if (attention === 0) return 0;
	const elevation = Math.atan2(-dy, Math.max(fox.width * .1, -dx)) * 180 / Math.PI;
	const neutralElevation = 30;
	return Math.max(FOX_HEAD_LIMITS.down, Math.min(FOX_HEAD_LIMITS.up, (elevation - neutralElevation) * .22)) * attention;
}
