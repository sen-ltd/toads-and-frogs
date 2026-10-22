// Toads and Frogs on a 1×n strip.
//
// A board is a string over 'T' (toad, Left's piece), 'F' (frog, Right's piece)
// and '.' (empty square). A toad moves one square right into an empty square,
// or jumps one frog into the empty square beyond it; frogs do the same to the
// left. Whoever cannot move loses.
//
// Values are found by recursion on the options, but every position is first
// cut down with Erickson's simplification rules (dead pieces, terminal toads,
// finished frogs, the Death Leap Principle), which split it into independent
// pieces plus an integer. `RawValuer` skips all of that; the two are compared
// on every small board in tools/verify.mts.

import { type GameId, ZERO, add, make, numberGame } from './cgt.ts';

export type Board = string;

export interface Move {
  /** square the piece leaves */
  from: number;
  /** square the piece lands on */
  to: number;
  after: Board;
}

/** Every move of Left (toads) or Right (frogs). Each piece has at most one. */
export function moves(b: Board, left: boolean): Move[] {
  const out: Move[] = [];
  const me = left ? 'T' : 'F';
  const them = left ? 'F' : 'T';
  const dir = left ? 1 : -1;
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== me) continue;
    let to = -1;
    if (b[i + dir] === '.') to = i + dir;
    else if (b[i + dir] === them && b[i + 2 * dir] === '.') to = i + 2 * dir;
    if (to < 0) continue;
    const a = b.split('');
    a[i] = '.';
    a[to] = me;
    out.push({ from: i, to, after: a.join('') });
  }
  return out;
}

/** The mirror image with the roles swapped: its value is the negative. */
export const mirror = (b: Board): Board =>
  b.split('').reverse().map((c) => (c === 'T' ? 'F' : c === 'F' ? 'T' : c)).join('');

/** Death Leap Principle, syntactic form: no TF.., ..TF, T. or .F means value 0. */
export const deathLeap = (b: Board): boolean =>
  !b.includes('T.') && !b.includes('.F') && !b.includes('TF..') && !b.includes('..TF');

/**
 * The squares [p, q) of a dead block, or null. A run of pieces from a TT (or the
 * left edge) to an FF (or the right edge) can never move again, and nothing
 * moves across it.
 */
export function deadBlock(b: Board): [number, number] | null {
  const n = b.length;
  let i = 0;
  while (i < n) {
    if (b[i] === '.') { i++; continue; }
    let j = i;
    while (j < n && b[j] !== '.') j++;
    // run of pieces [i, j)
    let p = -1;
    if (i === 0) p = 0;
    else for (let k = i; k + 1 < j; k++) if (b[k] === 'T' && b[k + 1] === 'T') { p = k; break; }
    let q = -1;
    if (j === n) q = n;
    else for (let k = j; k - 2 >= i; k--) if (b[k - 1] === 'F' && b[k - 2] === 'F') { q = k; break; }
    if (p >= 0 && q > p) return [p, q];
    i = j;
  }
  return null;
}

export interface Simplified {
  /** independent pieces left to evaluate, each in its own frame */
  parts: Board[];
  /** free moves credited to Left (negative: to Right) */
  int: number;
}

/**
 * Cut a board into independent pieces and an integer:
 *  - the terminal toads theorem  X T .^n = X .^n + n  (no frog to the right of T),
 *  - the finished frogs formula  .^n F X = .^n X − n,
 *  - dead blocks split the strip in two,
 *  - pieces with no moves but jumps into isolated squares are 0 (Death Leap).
 */
export function simplify(b: Board): Simplified {
  const parts: Board[] = [];
  let int = 0;
  const stack: Board[] = [b];
  while (stack.length) {
    let s = stack.pop()!;
    for (;;) {
      let changed = false;
      const j = Math.max(s.lastIndexOf('T'), s.lastIndexOf('F'));
      if (j >= 0 && s[j] === 'T') {
        int += s.length - 1 - j;
        s = s.slice(0, j) + s.slice(j + 1);
        changed = true;
      }
      const t = s.search(/[TF]/);
      if (t >= 0 && s[t] === 'F') {
        int -= t;
        s = s.slice(0, t) + s.slice(t + 1);
        changed = true;
      }
      if (!changed) break;
    }
    if (!/[TF]/.test(s)) continue;
    const dead = deadBlock(s);
    if (dead) {
      stack.push(s.slice(0, dead[0]), s.slice(dead[1]));
      continue;
    }
    if (deathLeap(s)) continue;
    parts.push(s);
  }
  parts.sort();
  return { parts, int };
}

/** Values with simplification; pieces are memoized by their string. */
export class Valuer {
  private memo = new Map<Board, GameId>();

  get size(): number {
    return this.memo.size;
  }

  value(b: Board): GameId {
    const { parts, int } = simplify(b);
    let g = numberGame(int);
    for (const p of parts) g = add(g, this.piece(p));
    return g;
  }

  /** value of one simplified piece, from its options */
  piece(p: Board): GameId {
    const hit = this.memo.get(p);
    if (hit !== undefined) return hit;
    const L = moves(p, true).map((m) => this.value(m.after));
    const R = moves(p, false).map((m) => this.value(m.after));
    const g = make(L, R);
    this.memo.set(p, g);
    return g;
  }
}

/** Values straight from the definition: no rules, no splitting. */
export class RawValuer {
  private memo = new Map<Board, GameId>();

  get size(): number {
    return this.memo.size;
  }

  value(b: Board): GameId {
    const hit = this.memo.get(b);
    if (hit !== undefined) return hit;
    const L = moves(b, true).map((m) => this.value(m.after));
    const R = moves(b, false).map((m) => this.value(m.after));
    const g = L.length || R.length ? make(L, R) : ZERO;
    this.memo.set(b, g);
    return g;
  }
}

/** Who wins with `left` to move, by plain search (no values at all). */
export class Minimax {
  private memo = new Map<string, boolean>();

  get size(): number {
    return this.memo.size;
  }

  /** true when the player to move wins */
  wins(b: Board, left: boolean): boolean {
    const key = (left ? 'L' : 'R') + b;
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    let r = false;
    for (const m of moves(b, left)) if (!this.wins(m.after, !left)) { r = true; break; }
    this.memo.set(key, r);
    return r;
  }
}

/** T^a .^b F^c */
export const start = (a: number, b: number, c: number): Board => 'T'.repeat(a) + '.'.repeat(b) + 'F'.repeat(c);

/** Parse the compact notation T3.2F3, T□TF□F□6, TT..FF, … into a board. */
export function parseBoard(src: string): Board {
  const s = src.replace(/[□_ ]/g, '.').replace(/[▢◻]/g, '.');
  let out = '';
  const re = /([TF.])(\d*)/gy;
  let m: RegExpExecArray | null;
  let at = 0;
  while ((m = re.exec(s))) {
    out += m[1].repeat(m[2] === '' ? 1 : Number(m[2]));
    at = re.lastIndex;
    if (at >= s.length) break;
  }
  if (at !== s.length) throw new Error(`bad board: ${src}`);
  return out;
}

/** Compact notation: TTT..FF → T3□2F2 */
export function compact(b: Board): string {
  return b.replace(/(T+|F+|\.+)/g, (run) => {
    const c = run[0] === '.' ? '□' : run[0];
    return run.length === 1 ? c : `${c}${run.length}`;
  });
}
