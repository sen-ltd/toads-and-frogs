import { describe, expect, it } from 'vitest';
import { ZERO, STAR, UP, DOWN, add, make, neg, numberGame, outcome, name } from '../src/cgt.ts';
import { Valuer, RawValuer, Minimax, moves, mirror, simplify, deathLeap, start, parseBoard, compact } from '../src/toads.ts';
import { thermograph } from '../src/thermo.ts';
import { parseGame } from '../src/notation.ts';

const v = new Valuer();
const val = (b: string) => v.value(parseBoard(b));

function* allBoards(maxLen: number): Generator<string> {
  for (let n = 1; n <= maxLen; n++) {
    for (let code = 0; code < 3 ** n; code++) {
      let b = '';
      for (let c = code, i = 0; i < n; i++, c = Math.floor(c / 3)) b += '.TF'[c % 3];
      yield b;
    }
  }
}

describe('moves', () => {
  it('steps into an empty square or jumps one opposing piece', () => {
    expect(moves('T.F', true).map((m) => m.after)).toEqual(['.TF']);
    expect(moves('TF.', true).map((m) => m.after)).toEqual(['.FT']);
    expect(moves('TF.', false)).toEqual([]);
    expect(moves('.TF', false).map((m) => m.after)).toEqual(['FT.']);
    // no jumping two pieces, no jumping your own, nothing off the edge
    expect(moves('TFF.', true)).toEqual([]);
    expect(moves('TT.', true).map((m) => m.after)).toEqual(['T.T']);
    expect(moves('..T', true)).toEqual([]);
  });

  it('round-trips the compact notation', () => {
    expect(parseBoard('T3□2F3')).toBe('TTT..FFF');
    expect(compact('T.TF.F......')).toBe('T□TF□F□6');
    expect(parseBoard(compact('TFTFF.FT..TTFF.TFF..TT'))).toBe('TFTFF.FT..TTFF.TFF..TT');
  });
});

describe('values', () => {
  it('knows the Winning Ways classics', () => {
    expect(val('T□F')).toBe(STAR);
    expect(val('TT□FF')).toBe(STAR);
    expect(val('TTT□□FFF')).toBe(make([numberGame(1 / 8)], [numberGame(-1 / 8)]));
    expect(val('TTT□F')).toBe(parseGame('{{1|1}|0}'));
  });

  it('simplifies Erickson\'s example to the integer 1 without any search', () => {
    expect(simplify('TFTFF.FT..TTFF.TFF..TT')).toEqual({ parts: [], int: 1 });
    expect(val('TFTFF□FT□□TTFF□TFF□□TT')).toBe(numberGame(1));
  });

  it('gives the same value with and without the simplification rules (every strip up to 8)', () => {
    const raw = new RawValuer();
    for (const b of allBoards(8)) expect(v.value(b), b).toBe(raw.value(b));
  });

  it('agrees with a plain win/lose search on who wins (every strip up to 8)', () => {
    const mm = new Minimax();
    for (const b of allBoards(8)) {
      const l = mm.wins(b, true), r = mm.wins(b, false);
      expect(outcome(v.value(b)), b).toBe(l && r ? 'N' : l ? 'L' : r ? 'R' : 'P');
    }
  });

  it('values the mirror image as the negative', () => {
    for (const b of allBoards(7)) expect(v.value(mirror(b)), b).toBe(neg(v.value(b)));
  });

  it('treats positions whose only moves are jumps into single gaps as 0', () => {
    for (const b of allBoards(8)) if (deathLeap(b)) expect(v.value(b), b).toBe(ZERO);
  });

  it('matches Erickson\'s closed form for one-frog starting positions', () => {
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      const want = b === 1 ? parseGame(`{{${a - 2}|1}|0}`)
        : add(numberGame((a - 1) * (b - 1)), b % 2 ? STAR : ZERO);
      expect(v.value(start(a, b, 1)), `T${a}□${b}F`).toBe(want);
    }
  });

  it('prints T4□□F4 exactly as Erickson does', () => {
    expect(val('T4□2F4')).toBe(parseGame('±({1|*}, {{3/2|{1|{0|0,v*}}}|0})'));
  });

  it('settles the cell where the two papers disagree: T5□4F3 = {{3*|5/2}|2}', () => {
    expect(val('T5□4F3')).toBe(parseGame('{{3*|5/2}|2}'));
    expect(val('T5□4F3')).not.toBe(parseGame('{{5/2|2}|2}'));
  });
});

describe('thermographs', () => {
  it('has the textbook means and temperatures', () => {
    // worked by hand: for {1 | {1/2|0}} the left scaffold 1 − t meets the right
    // scaffold 1/4 + t (the right option's mast is already up at t = 1/4) at t = 3/8
    const cases: [string, number, number][] = [
      ['±1', 0, 1], ['{3|1}', 2, 1], ['±1/8', 0, 1 / 8], ['{1|{1/2|0}}', 5 / 8, 3 / 8],
      ['{{2|1}|0}', 3 / 4, 3 / 4], ['{2|{1|0}}', 5 / 4, 3 / 4], ['*', 0, 0], ['^', 0, 0],
    ];
    for (const [s, m, t] of cases) {
      const th = thermograph(parseGame(s));
      expect([th.mean, th.temperature], s).toEqual([m, t]);
    }
    expect(thermograph(UP).mean).toBe(0);
    // crossings whose ratio d0 / (d0 − d1) is 1/3: still exact
    expect(thermograph(parseGame('{{25/8|0}|-7/16}')).temperature).toBe(7 / 16);
    const g = thermograph(parseGame('{7/16|{-1/16|-25/8}}'));
    expect([g.temperature, g.mean]).toEqual([1 / 2, -1 / 16]);
  });

  it('heats T□TF□F□^n up to {n+1/2 | 1}, temperature (2n−1)/4 (Erickson thm 3.5)', () => {
    for (let n = 6; n <= 10; n++) {
      const g = v.value('T.TF.F' + '.'.repeat(n));
      expect(g).toBe(make([numberGame(n + 0.5)], [numberGame(1)]));
      expect(thermograph(g).temperature).toBe((2 * n - 1) / 4);
    }
  });

  it('adds means over sums', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
    const board = () => Array.from({ length: 4 + Math.floor(rnd() * 6) }, () => '.TF'[Math.floor(rnd() * 3)]).join('');
    for (let i = 0; i < 300; i++) {
      const x = board(), y = board();
      const g = v.value(x), h = v.value(y);
      expect(v.value(x + 'TTFF' + y)).toBe(add(g, h));
      expect(thermograph(add(g, h)).mean).toBe(thermograph(g).mean + thermograph(h).mean);
    }
  });
});

describe('notation', () => {
  it('keeps a number and a multiple of ↓ apart: T6□5F5 = 2 + 4·↓, not "24↓"', () => {
    const g = val('T6□5F5');
    expect(name(g)).toBe('2 + 4·↓');
    expect(parseGame('2 + 4·↓')).toBe(add(numberGame(2), add(add(DOWN, DOWN), add(DOWN, DOWN))));
    expect(g).toBe(parseGame(name(g)));
  });

  it('parses back every name it prints', () => {
    for (const b of allBoards(7)) {
      const g = v.value(b);
      expect(parseGame(name(g)), `${b} = ${name(g)}`).toBe(g);
    }
  });
});
