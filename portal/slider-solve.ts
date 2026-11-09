// A quick slider solver for hints and star targets. Weighted A*: it finds a good
// (not always shortest) solution fast, even on 5×5. Positions are tile positions
// to slide into the empty square, as in shared/slider.ts.

/** Manhattan distance plus linear conflicts (a tighter estimate of moves left). */
function estimate(t: Uint8Array, n: number): number {
  const blank = n * n - 1;
  let d = 0;
  for (let p = 0; p < t.length; p++) {
    const v = t[p];
    if (v === blank) continue;
    d += Math.abs(((v / n) | 0) - ((p / n) | 0)) + Math.abs((v % n) - (p % n));
  }
  // Two tiles in their own row (or column) but in the wrong order cost 2 extra.
  for (let r = 0; r < n; r++) {
    for (let a = 0; a < n; a++) {
      const va = t[r * n + a];
      if (va === blank || ((va / n) | 0) !== r) continue;
      for (let b = a + 1; b < n; b++) {
        const vb = t[r * n + b];
        if (vb !== blank && ((vb / n) | 0) === r && vb < va) d += 2;
      }
    }
  }
  for (let c = 0; c < n; c++) {
    for (let a = 0; a < n; a++) {
      const va = t[a * n + c];
      if (va === blank || va % n !== c) continue;
      for (let b = a + 1; b < n; b++) {
        const vb = t[b * n + c];
        if (vb !== blank && vb % n === c && vb < va) d += 2;
      }
    }
  }
  return d;
}

class Heap {
  private a: { f: number; i: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(f: number, i: number) {
    const a = this.a;
    a.push({ f, i });
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (a[p].f <= a[k].f) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top.i;
  }
}

/**
 * Moves (positions to slide) that solve the board, or null if it gives up.
 * Tries a few weights: lower is closer to the shortest solution but slower.
 */
export function solveSlider(tiles: number[], n: number, cap = 250_000): number[] | null {
  for (const w of n <= 3 ? [1, 2] : n === 4 ? [1.8, 3, 6] : [3, 6, 12]) {
    const r = search(tiles, n, w, cap);
    if (r) return r;
  }
  return null;
}

function search(tiles: number[], n: number, w: number, cap: number): number[] | null {
  const blankTile = n * n - 1;
  const states: Uint8Array[] = [];
  const g: number[] = [];
  const parent: number[] = [];
  const move: number[] = [];
  const blankAt: number[] = [];
  const seen = new Map<string, number>();
  const start = Uint8Array.from(tiles);
  states.push(start);
  g.push(0);
  parent.push(-1);
  move.push(-1);
  blankAt.push(start.indexOf(blankTile));
  seen.set(start.join(','), 0);
  const open = new Heap();
  open.push(w * estimate(start, n), 0);
  while (open.size) {
    const i = open.pop();
    const s = states[i];
    if (estimate(s, n) === 0 && s[n * n - 1] === blankTile) {
      const path: number[] = [];
      for (let k = i; parent[k] >= 0; k = parent[k]) path.push(move[k]);
      return path.reverse();
    }
    if (states.length > cap) return null;
    const b = blankAt[i];
    const r = (b / n) | 0;
    const c = b % n;
    for (const q of [r > 0 ? b - n : -1, r < n - 1 ? b + n : -1, c > 0 ? b - 1 : -1, c < n - 1 ? b + 1 : -1]) {
      if (q < 0 || q === blankAt[parent[i]] ) continue;
      const t = s.slice();
      t[b] = t[q];
      t[q] = blankTile;
      const key = t.join(',');
      const ng = g[i] + 1;
      const old = seen.get(key);
      if (old !== undefined && g[old] <= ng) continue;
      const k = states.length;
      states.push(t);
      g.push(ng);
      parent.push(i);
      move.push(q);
      blankAt.push(q);
      seen.set(key, k);
      open.push(ng + w * estimate(t, n), k);
    }
  }
  return null;
}
