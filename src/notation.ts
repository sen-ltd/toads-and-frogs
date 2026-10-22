// Parse the usual game notation into canonical games, for checking published
// values: 3/2, -1, *, *2, ^ (↑), v (↓), 1*, 3^*, {1*|v}, {{2|1}|{*|-1}},
// ±1/8, ±({1|*}, {0|1}), 2 + 4·↓. Juxtaposition is a sum, so "1/2v" is 1/2 + ↓.

import { type GameId, ZERO, STAR, UP, DOWN, add, make, neg, nimber, numberGame } from './cgt.ts';

export function parseGame(src: string): GameId {
  const s = src.replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  const fail = (what: string): never => {
    throw new Error(`${what} at ${i} in "${src}"`);
  };

  function list(stop: string): GameId[] {
    const out: GameId[] = [];
    if (peek() === stop) return out;
    for (;;) {
      out.push(game());
      if (peek() === ',') { i++; continue; }
      return out;
    }
  }

  function game(): GameId {
    if (peek() === '±') {
      i++;
      let xs: GameId[];
      if (peek() === '(') {
        i++;
        xs = list(')');
        if (s[i++] !== ')') fail('expected )');
      } else xs = [term()];
      return make(xs, xs.map(neg));
    }
    let g = term();
    while (i < s.length && !',|})'.includes(peek())) {
      if (peek() === '+') i++;
      g = add(g, term());
    }
    return g;
  }

  function term(): GameId {
    const c = peek();
    if (c === '{') {
      i++;
      const L = list('|');
      if (s[i++] !== '|') fail('expected |');
      const R = list('}');
      if (s[i++] !== '}') fail('expected }');
      return make(L, R);
    }
    if (c === '*') {
      i++;
      const m = /^\d+/.exec(s.slice(i));
      if (!m) return STAR;
      i += m[0].length;
      return nimber(Number(m[0]));
    }
    if (c === '^' || c === '↑') { i++; return UP; }
    if (c === 'v' || c === '↓') { i++; return DOWN; }
    if (c === '⇑') { i++; return add(UP, UP); }
    if (c === '⇓') { i++; return add(DOWN, DOWN); }
    const m = /^[-−]?\d+(\/\d+)?/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      const [p, q] = m[0].replace('−', '-').split('/');
      const x = Number(p) / (q ? Number(q) : 1);
      // 4·↓ is four copies of ↓
      if (peek() === '·') {
        if (!Number.isInteger(x) || x < 0) fail('a multiple needs a whole number');
        i++;
        const unit = term();
        let g = ZERO;
        for (let k = 0; k < x; k++) g = add(g, unit);
        return g;
      }
      return numberGame(x);
    }
    return fail('unexpected character');
  }

  if (s === '') return ZERO;
  const g = game();
  if (i !== s.length) fail('trailing input');
  return g;
}
