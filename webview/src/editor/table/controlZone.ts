/**
 * Margin around a table where its controls stay visible: the grips sit on its
 * top and left edges, the + bars just outside its right and bottom edges, and
 * the pointer crosses that gap (outside the table wrapper when the table is as
 * wide as the page) to reach them.
 */
export const CONTROL_ZONE = { left: 24, top: 20, right: 40, bottom: 36 };

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** True when the point is on the table (its visible part) or in the margin that holds its controls. */
export function inControlZone(table: Box, clip: Box, x: number, y: number): boolean {
  const right = Math.min(table.right, clip.right);
  return (
    x >= table.left - CONTROL_ZONE.left &&
    x <= right + CONTROL_ZONE.right &&
    y >= table.top - CONTROL_ZONE.top &&
    y <= table.bottom + CONTROL_ZONE.bottom
  );
}
