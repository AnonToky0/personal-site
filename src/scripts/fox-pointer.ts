type HorizontalBounds = { left: number; right: number };

export const FOX_GUTTER_PADDING = 24;

// Protect the full navigation width plus padding, including narrower reading
// columns below it. Hysteresis stays outside that protected strip.
export function isInSideGutter(
	x: number,
	content: HorizontalBounds,
	viewportWidth: number,
	wasInGutter = false,
): boolean {
	const minGutter = 64;
	const gap = FOX_GUTTER_PADDING + (wasInGutter ? 0 : 8);
	if (x < 0 || x >= viewportWidth || content.right <= content.left) return false;
	return (content.left >= minGutter && x < content.left - gap) ||
		(viewportWidth - content.right >= minGutter && x > content.right + gap);
}
