// Squarified treemap layout (Bruls, Huizing, van Wijk 2000): rectangles whose areas
// are proportional to the values, laid out in rows that keep each cell as close to
// square as the values allow. Pure, so pages lay it out on the server.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Worst aspect ratio of a row of areas laid along a side of length `side`. */
function worst(row: number[], side: number): number {
  const s = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
}

/**
 * Lays `values` (any order, non-positive ones get no cell) into `rect`. Returns one
 * rectangle per input, in input order; null for values that got none.
 */
export function squarify(values: number[], rect: Rect): (Rect | null)[] {
  const order = values.map((v, i) => ({ v, i })).filter((e) => e.v > 0 && Number.isFinite(e.v));
  order.sort((a, b) => b.v - a.v);
  const total = order.reduce((a, e) => a + e.v, 0);
  const out: (Rect | null)[] = values.map(() => null);
  if (!total || rect.w <= 0 || rect.h <= 0) return out;
  const scale = (rect.w * rect.h) / total;
  const areas = order.map((e) => e.v * scale);

  let free = { ...rect };
  let row: number[] = [];
  let start = 0;

  const place = (areasInRow: number[], first: number) => {
    const s = areasInRow.reduce((a, b) => a + b, 0);
    if (free.w >= free.h) {
      // A column along the left edge.
      const colW = s / free.h;
      let y = free.y;
      areasInRow.forEach((a, k) => {
        const h = a / colW;
        out[order[first + k].i] = { x: free.x, y, w: colW, h };
        y += h;
      });
      free = { x: free.x + colW, y: free.y, w: free.w - colW, h: free.h };
    } else {
      // A row along the top edge.
      const rowH = s / free.w;
      let x = free.x;
      areasInRow.forEach((a, k) => {
        const w = a / rowH;
        out[order[first + k].i] = { x, y: free.y, w, h: rowH };
        x += w;
      });
      free = { x: free.x, y: free.y + rowH, w: free.w, h: free.h - rowH };
    }
  };

  areas.forEach((a, k) => {
    const side = Math.min(free.w, free.h);
    if (!row.length || worst([...row, a], side) <= worst(row, side)) {
      row.push(a);
    } else {
      place(row, start);
      start = k;
      row = [a];
    }
  });
  if (row.length) place(row, start);
  return out;
}
