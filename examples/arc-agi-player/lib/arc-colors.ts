/**
 * ARC-AGI-3 uses a 16-color palette (indices 0-15).
 * These colors match the official ARC engine rendering.
 */
export const ARC_COLORS: Record<number, string> = {
  0: "#000000",  // Black (background)
  1: "#ffffff",  // White
  2: "#ff0000",  // Red
  3: "#00ff00",  // Green
  4: "#0000ff",  // Blue
  5: "#ffff00",  // Yellow
  6: "#ff00ff",  // Magenta
  7: "#00ffff",  // Cyan
  8: "#ff8000",  // Orange
  9: "#8000ff",  // Purple
  10: "#0080ff", // Light blue
  11: "#ff0080", // Pink
  12: "#80ff00", // Lime
  13: "#00ff80", // Spring green
  14: "#8080ff", // Lavender
  15: "#ff8080", // Salmon
};

export function getArcColor(index: number): string {
  return ARC_COLORS[index] ?? "#333333";
}
