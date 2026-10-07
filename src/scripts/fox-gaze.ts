type Point = { x: number; y: number };
type FoxBounds = { left: number; top: number; width: number; height: number };

export const FOX_HEAD_LIMITS = { down: -18, up: 22 };

/** Gentle 2D pitch of the approved left-facing head, not a full turn of the face. */
export function getFoxHeadAngle(pointer: Point, fox: FoxBounds): number {
	const dx = pointer.x - (fox.left + fox.width * 0.38);
	const dy = pointer.y - (fox.top + fox.height * 0.30);
	// Near the neck, tiny pointer movements should not flip the head's direction.
	if (Math.hypot(dx, dy) < fox.width * 0.15) return 0;
	// Mirror the horizontal distance to avoid an angle wrap on the fox's right.
	const elevation = Math.atan2(-dy, Math.abs(dx)) * 180 / Math.PI;
	const neutralElevation = 30;
	return Math.max(FOX_HEAD_LIMITS.down, Math.min(FOX_HEAD_LIMITS.up, elevation - neutralElevation));
}
