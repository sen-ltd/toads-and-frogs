// Thermographs of short games, for t ≥ 0.
//
// A wall is a piecewise-linear function of the tax t. For a game G that is not
// a number, the left scaffold is max over G^L of (right wall of G^L) − t and the
// right scaffold is min over G^R of (left wall of G^R) + t. They meet at the
// temperature T, at the mean m; above T both walls are the mast m. A number's
// walls are the constant x. Every breakpoint is a dyadic rational, so plain
// doubles stay exact, as long as a crossing is computed as t0 + d0·Δ / (d0 − d1)
// (multiply first: d0 / (d0 − d1) alone can be 1/3 and round).

import { type GameId, isNumber, numberValue, leftOptions, rightOptions } from './cgt.ts';

/** Piecewise-linear: points (ts[i], vs[i]) with ts[0] = 0, then slope `tail`. */
export interface PL {
  ts: number[];
  vs: number[];
  tail: number;
}

export const constant = (x: number): PL => ({ ts: [0], vs: [x], tail: 0 });

export function evalPL(f: PL, t: number): number {
  const n = f.ts.length;
  if (t >= f.ts[n - 1]) return f.vs[n - 1] + f.tail * (t - f.ts[n - 1]);
  let i = 0;
  while (f.ts[i + 1] <= t) i++;
  const t0 = f.ts[i];
  const t1 = f.ts[i + 1];
  return f.vs[i] + ((f.vs[i + 1] - f.vs[i]) * (t - t0)) / (t1 - t0);
}

/** Drop points that lie on the line through their neighbours. */
function tidy(ts: number[], vs: number[], tail: number): PL {
  const T: number[] = [ts[0]];
  const V: number[] = [vs[0]];
  for (let i = 1; i < ts.length; i++) {
    const n = T.length;
    const sIn = n >= 1 ? (vs[i] - V[n - 1]) / (ts[i] - T[n - 1]) : NaN;
    const sOut = i + 1 < ts.length ? (vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i]) : tail;
    if (sIn === sOut) continue;
    T.push(ts[i]);
    V.push(vs[i]);
  }
  return { ts: T, vs: V, tail };
}

/** f + slope·t */
export function shear(f: PL, slope: number): PL {
  return { ts: f.ts.slice(), vs: f.vs.map((v, i) => v + slope * f.ts[i]), tail: f.tail + slope };
}

/** pointwise max (sign = 1) or min (sign = −1) */
function extreme(f: PL, g: PL, sign: 1 | -1): PL {
  const bs = [...new Set([...f.ts, ...g.ts])].sort((a, b) => a - b);
  const pts: number[] = [];
  for (let i = 0; i < bs.length; i++) {
    pts.push(bs[i]);
    const d0 = evalPL(f, bs[i]) - evalPL(g, bs[i]);
    if (i + 1 < bs.length) {
      const d1 = evalPL(f, bs[i + 1]) - evalPL(g, bs[i + 1]);
      if (d0 * d1 < 0) pts.push(bs[i] + (d0 * (bs[i + 1] - bs[i])) / (d0 - d1));
    } else {
      const ds = f.tail - g.tail;
      if (d0 * ds < 0) pts.push(bs[i] - d0 / ds);
    }
  }
  const pick = (t: number) => {
    const a = evalPL(f, t);
    const b = evalPL(g, t);
    return sign > 0 ? Math.max(a, b) : Math.min(a, b);
  };
  const vs = pts.map(pick);
  const last = pts[pts.length - 1];
  // no crossing after the last point, so the winner there keeps its slope
  const tail = pick(last + 1) - vs[vs.length - 1];
  return tidy(pts, vs, tail);
}

export const maxPL = (f: PL, g: PL) => extreme(f, g, 1);
export const minPL = (f: PL, g: PL) => extreme(f, g, -1);

export interface Thermograph {
  left: PL;
  right: PL;
  /** the tax at which the walls meet (−1/2^k for numbers by convention) */
  temperature: number;
  mean: number;
  /** scaffolds before they are cut at the temperature (null for numbers) */
  leftScaffold: PL | null;
  rightScaffold: PL | null;
}

const memo = new Map<GameId, Thermograph>();

function numberTemperature(x: number): number {
  let d = 1;
  while (!Number.isInteger(x * d)) d *= 2;
  return -1 / d;
}

/** First t ≥ 0 with f(t) ≤ g(t), for f non-increasing minus g non-decreasing. */
function meet(f: PL, g: PL): number {
  const bs = [...new Set([...f.ts, ...g.ts])].sort((a, b) => a - b);
  for (let i = 0; i < bs.length; i++) {
    const d0 = evalPL(f, bs[i]) - evalPL(g, bs[i]);
    if (d0 <= 0) return bs[i];
    if (i + 1 < bs.length) {
      const d1 = evalPL(f, bs[i + 1]) - evalPL(g, bs[i + 1]);
      if (d1 <= 0) return bs[i] + (d0 * (bs[i + 1] - bs[i])) / (d0 - d1);
    } else {
      const ds = f.tail - g.tail;
      if (ds >= 0) throw new Error('scaffolds never meet');
      return bs[i] - d0 / ds;
    }
  }
  throw new Error('unreachable');
}

/** cut f at T: f up to T, then the constant m */
function mast(f: PL, T: number, m: number): PL {
  const ts: number[] = [];
  const vs: number[] = [];
  for (let i = 0; i < f.ts.length && f.ts[i] < T; i++) {
    ts.push(f.ts[i]);
    vs.push(f.vs[i]);
  }
  ts.push(T);
  vs.push(m);
  return tidy(ts, vs, 0);
}

export function thermograph(g: GameId): Thermograph {
  const hit = memo.get(g);
  if (hit) return hit;
  let th: Thermograph;
  if (isNumber(g)) {
    const x = numberValue(g);
    th = {
      left: constant(x), right: constant(x), temperature: numberTemperature(x), mean: x,
      leftScaffold: null, rightScaffold: null,
    };
  } else {
    const L = leftOptions(g).map((o) => shear(thermograph(o).right, -1));
    const R = rightOptions(g).map((o) => shear(thermograph(o).left, 1));
    const ls = L.reduce(maxPL);
    const rs = R.reduce(minPL);
    const T = meet(ls, rs);
    const m = evalPL(ls, T);
    th = { left: mast(ls, T, m), right: mast(rs, T, m), temperature: T, mean: m, leftScaffold: ls, rightScaffold: rs };
  }
  memo.set(g, th);
  return th;
}

export const temperature = (g: GameId) => thermograph(g).temperature;
export const mean = (g: GameId) => thermograph(g).mean;
