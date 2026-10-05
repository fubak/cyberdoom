/** Level-authoring helpers (LEVELS-owned). */

/** Expand inclusive [x0, y0, x1, y1, light] rects into MapDef.lights. Later rects win. */
export function lightRects(rects: [number, number, number, number, number][]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [x0, y0, x1, y1, v] of rects) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out[`${x},${y}`] = v;
  }
  return out;
}
