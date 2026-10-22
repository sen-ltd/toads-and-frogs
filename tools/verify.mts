// Checks the engine against plain search, against the published tables and
// theorems of Erickson (1996) and Thanatipanonda (2008), and extends the tables.
//
//   node tools/verify.mts <experiment> [args]   → runs/<experiment>-<args>.json
//
// experiments:
//   boards <maxLen>            every board up to maxLen squares: simplified value = raw value,
//                              mirror = negative, outcome = win/lose search; value census
//   literature                 every published value and closed form we can reach
//   symmetric <a> <bMax>       T^a □^b F^a for b = 1..bMax, one cell at a time
//   family <k> <aMax> <bMax> [maxLen]   T^(a+k) □^b F^a, a = 1..aMax, b = 1..bMax
//   thermo <count> <maxLen>    random sums (half of them hot + hot): mean(G+H) = mean G + mean H, temp(G+H) ≤ max

import { writeFileSync, mkdirSync } from 'node:fs';
import {
  type GameId, ZERO, STAR, UP, DOWN, make, add, neg, le, outcome, isNumber, numberGame, nimber,
  name, stops, gameCount,
} from '../src/cgt.ts';
import { Valuer, RawValuer, Minimax, mirror, start, parseBoard, compact, moves } from '../src/toads.ts';
import * as cgtOptions from '../src/cgt.ts';
import { thermograph } from '../src/thermo.ts';
import { parseGame } from '../src/notation.ts';

const [exp, ...args] = process.argv.slice(2);
const t0 = Date.now();
mkdirSync('runs', { recursive: true });
const file = [exp, ...args].join('-');
const save = (data: object, quiet = false) => {
  const out = { experiment: exp, args, ms: Date.now() - t0, node: process.version, ...data };
  writeFileSync(`runs/${file}.json`, JSON.stringify(out, null, 1) + '\n');
  if (!quiet) console.log(JSON.stringify(out).slice(0, 3000));
};

const isInfinitesimal = (g: GameId) => {
  const [l, r] = stops(g);
  return l === 0 && r === 0;
};
const fmt = (x: number) => (Number.isInteger(x * 1024) ? String(x) : x.toFixed(6));

// ---------------------------------------------------------------------------

function boards(maxLen: number) {
  const sv = new Valuer();
  const mm = new Minimax();
  const perLen: object[] = [];
  let mismatches = 0;
  const examples: string[] = [];
  for (let n = 1; n <= maxLen; n++) {
    const raw = new RawValuer(); // one strip length at a time keeps memory flat
    const values = new Set<GameId>();
    let count = 0, nums = 0, infs = 0, hot = 0, maxTemp = -1, hottest = '';
    let mirrorBad = 0, outcomeBad = 0, splitBad = 0;
    const total = 3 ** n;
    for (let code = 0; code < total; code++) {
      let b = '';
      for (let c = code, i = 0; i < n; i++, c = Math.floor(c / 3)) b += '.TF'[c % 3];
      const g = sv.value(b);
      const r = raw.value(b);
      count++;
      if (g !== r) { splitBad++; if (examples.length < 10) examples.push(`split ${b}: ${name(g)} vs ${name(r)}`); }
      if (sv.value(mirror(b)) !== neg(g)) mirrorBad++;
      // outcome from the value vs who wins each way by search
      const lFirst = mm.wins(b, true);
      const rFirst = mm.wins(b, false);
      const o = lFirst && rFirst ? 'N' : lFirst ? 'L' : rFirst ? 'R' : 'P';
      if (o !== outcome(g)) { outcomeBad++; if (examples.length < 10) examples.push(`outcome ${b}: ${o} vs ${name(g)}`); }
      values.add(g);
      if (isNumber(g)) nums++;
      else {
        const th = thermograph(g);
        if (th.temperature === 0 && isInfinitesimal(g)) infs++;
        if (th.temperature > 0) hot++;
        if (th.temperature > maxTemp) { maxTemp = th.temperature; hottest = b; }
      }
    }
    mismatches += mirrorBad + outcomeBad + splitBad;
    const row = {
      len: n, boards: count, distinctValues: values.size, numbers: nums, infinitesimals: infs, hot,
      maxTemperature: maxTemp, hottest: compact(hottest), hottestValue: hottest ? name(sv.value(hottest)) : '',
      splitBad, mirrorBad, outcomeBad, rawStates: raw.size,
    };
    perLen.push(row);
    console.log(JSON.stringify(row));
    save({ perLen, mismatches, examples, pieceStates: sv.size, games: gameCount() }, true);
  }
  save({ perLen, mismatches, examples, pieceStates: sv.size, games: gameCount() });
}

// ---------------------------------------------------------------------------
// Published values. Tables are transcribed from the papers; '' = not given,
// 'N' / 'L' = a long value the paper does not print, '!0' = "≠ 0",
// '<x', 'x<V<y', '||x' (incomparable with x), '<x||y' are inequalities.

// Erickson 1996, p. 307: T^a □^b F^a (rows a = 1.., columns b = 1..)
const ERICKSON_SYM: string[][] = [
  ['*', '0', '*', '0', '*', '0'],
  ['*', '*', '*', '*', '0', '0'],
  ['*', '±1/8', '0', '*', '0'],
  ['*', '±({1|*}, {{3/2|{1|{0|0,v*}}}|0})', '*', '0'],
  ['*', 'N', '*'],
  ['*', 'N'],
];

// Erickson 1996, p. 309: T^a □^b F^c, b = 1..5
const ERICKSON_ABC: Record<number, Record<number, string[]>> = {
  1: {
    2: ['{1/2|0}', '1', '2*', '3', '4*'],
    3: ['{1*|0}', '2', '4*', '6', '8*'],
    4: ['{{2|1}|0}', '3', '6*', '9', '12*'],
    5: ['{{3|1}|0}', '4', '8*', '12', '16*'],
    6: ['{{4|1}|0}', '5', '10*', '15', '20*'],
    7: ['{{5|1}|0}', '6', '12*', '18', '24*'],
  },
  2: {
    3: ['*', '{1/2|0}', '1*', '2*', '3'],
    4: ['*', '{3/2|0}', '2*', '4*', '95/16'],
    5: ['*', '{5/2|0}', '3*', '{6|11/2}', '{17/2|8}'],
    6: ['*', '{7/2|0}', '4*', '{15/2|7*}', '21/2'],
    7: ['*', '{9/2|0}', '5*', '9', '13'],
  },
  3: {
    4: ['*', '{1*|v}', '{1|{1/2|0}}', '1*', '2'],
    5: ['*', '{2*|v}', '3/2', '{{3*|5/2}|2}', '4'],
    6: ['*', '{3*|v}', '5/2', '{{5*|7/2}|3,3^*}', '41/8'],
    7: ['*', '{4*|v}', '7/2', 'L', ''],
  },
  4: {
    5: ['*', '{{2|1}|{*|-1}}', '1*', '{{2*|1*}|{1/2|0}}', '1'],
    6: ['*', '{{3|2}|{*|-1}}', '2*', '{{4*|2*}|{3/2|1}}', ''],
    7: ['*', '{{4|3}|{*|-1}}', '3*', '', ''],
  },
};

// Thanatipanonda 2008, Figure 2: T^a □^b F^a, a = 1..10, b = 1..20
const THANA_SYM: string[][] = [
  '* 0 * 0 * 0 * 0 * 0 * 0 * 0 * 0 * 0 * 0'.split(' '),
  '* * * * 0 0 * 0 0 0 0 0 * 0 0 0 0 0 * 0'.split(' '),
  '* ±1/8 0 * 0 * 0 0 0 0 0 0 0 * 0 0 0 0 0 0'.split(' '),
  '* N * 0 0 0 0 * * 0 0 0 0 0 0 0 0 0 0 0'.split(' '),
  '* N * * * 0 * 0 0 0 !0 0'.split(' '),
  '* N * * * * * !0'.split(' '),
  '* N * * * !0 !0'.split(' '),
  '* N * * *'.split(' '),
  '* N * *'.split(' '),
  '* N * *'.split(' '),
];

// Thanatipanonda 2008, Figures 3-6: T^(a+k) □^b F^a, columns from b = 3
const THANA_FAMILY: Record<number, string[][]> = {
  1: [
    ['2*', '3', '4*', '5', '6*', '7', '8*', '9', '10*', '11', '12*', '13', '14*', '15'],
    ['1*', '2*', '3', '7/2', '5*', '11/2', '13/2', '15/2', '17/2', '19/2', '41/4', '23/2', '12*', '13'],
    ['{1|{1/2|0}}', '1*', '2', '11/4', '15/4', '9/2', '<11/2', '<6'],
    ['1*', '{{2*|1*}|{1/2|0}}', '1', '2', '5/2<V<3', '<4'],
    ['1*', '1*', '5/4<V<2', '1', '5/2<V<3'],
    ['1*', '1*', '2*', '1<V<2', '<2||3'],
    ['1*', '1*', '||2'],
    ['1*', '1*', '||2'],
  ],
  2: [
    ['4*', '6', '8*', '10', '12*', '14', '16*', '18', '20*', '22'],
    ['2*', '4*', '95/16', '15/2', '9*', '{11|11*}', '12', '29/2', '15*', '17*'],
    ['3/2', '{{5/2|2}|2}', '4', '{11/2|41/8}', '7'],
    ['2*', '{{4*|2*}|{3/2|1}}', '3', '4', '5*'],
    ['2*', '2*', '3<V<4', '3', '5'],
    ['2*', '2*', '||4'],
    ['2*', '2*', '<3'],
  ],
  3: [
    ['6*', '9', '12*', '15', '18*', '21'],
    ['3*', '{6|11/2}', '{17/2|8}', '11*', '13', '31/2'],
    ['5/2', 'L', '41/8', '||8'],
    ['3*', '5/2', '5', '||5'],
    ['3*', '||3', '5<V<6'],
    ['3*', '3*'],
  ],
};

/** Does value g satisfy the published entry? null when there is nothing to check. */
function matches(g: GameId, entry: string): boolean | null {
  if (entry === '') return null;
  if (entry === 'L') return null;
  if (entry === 'N') return isInfinitesimal(g) && g !== ZERO && g !== STAR;
  if (entry === '!0') return g !== ZERO;
  const between = entry.match(/^(.+)<V<(.+)$/);
  if (between) {
    const lo = parseGame(between[1]);
    const hi = parseGame(between[2]);
    return le(lo, g) && !le(g, lo) && le(g, hi) && !le(hi, g);
  }
  const both = entry.match(/^<(.+)\|\|(.+)$/);
  if (both) return matches(g, `<${both[1]}`)! && matches(g, `||${both[2]}`)!;
  if (entry.startsWith('<')) {
    const x = parseGame(entry.slice(1));
    return le(g, x) && !le(x, g);
  }
  if (entry.startsWith('||')) {
    const x = parseGame(entry.slice(2));
    return !le(g, x) && !le(x, g);
  }
  return g === parseGame(entry);
}

function literature() {
  const v = new Valuer();
  const checks: Record<string, { checked: number; failed: string[] }> = {};
  const check = (group: string, label: string, ok: boolean | null, got: () => string) => {
    if (ok === null) return;
    if (!checks[group]) console.error(`${((Date.now() - t0) / 1000).toFixed(1)}s ${group}`);
    const c = (checks[group] ??= { checked: 0, failed: [] });
    c.checked++;
    if (!ok) c.failed.push(`${label} = ${got()}`);
  };
  const val = (b: string) => v.value(b);
  const nm = (g: GameId) => () => name(g);
  const t = (s: string) => parseGame(s);

  // --- tables ---
  ERICKSON_SYM.forEach((row, i) => row.forEach((e, j) => {
    const g = val(start(i + 1, j + 1, i + 1));
    check('erickson T^a□^bF^a', `T${i + 1}□${j + 1}F${i + 1} (${e})`, matches(g, e), nm(g));
  }));
  for (const [c, rows] of Object.entries(ERICKSON_ABC)) {
    for (const [a, row] of Object.entries(rows)) {
      row.forEach((e, j) => {
        const g = val(start(+a, j + 1, +c));
        check('erickson T^a□^bF^c', `T${a}□${j + 1}F${c} (${e})`, matches(g, e), nm(g));
      });
    }
  }
  // the long T7□4F3 is printed only "-ish": check the mean and temperature it implies, (7*|9/2||4)
  {
    const g = val(start(7, 4, 3));
    const th = thermograph(g);
    check('erickson T^a□^bF^c', `T7□4F3 is (7*|9/2||4)-ish: mean ${th.mean}, temperature ${th.temperature}`,
      th.mean === thermograph(t('{{7*|9/2}|4}')).mean && th.temperature === thermograph(t('{{7*|9/2}|4}')).temperature,
      nm(g));
  }
  // cap the symmetric table at boards we can afford in this run (the rest: `symmetric`)
  THANA_SYM.forEach((row, i) => row.forEach((e, j) => {
    const a = i + 1, b = j + 1;
    if (2 * a + b > 14) return;
    const g = val(start(a, b, a));
    check('thanatipanonda T^a□^bF^a', `T${a}□${b}F${a} (${e})`, matches(g, e), nm(g));
  }));
  for (const [k, rows] of Object.entries(THANA_FAMILY)) {
    rows.forEach((row, i) => row.forEach((e, j) => {
      const a = i + 1, b = j + 3;
      if (2 * a + +k + b > 15) return;
      const g = val(start(a + +k, b, a));
      check(`thanatipanonda T^(a+${k})□^bF^a`, `T${a + +k}□${b}F${a} (${e})`, matches(g, e), nm(g));
    }));
  }

  // --- closed forms ---
  const E = (n: number) => '.'.repeat(n);
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) {
    // Lemma 4.1
    const d = b - a;
    const want41 = d >= 2 ? d - 1 : Math.abs(d) <= 1 ? 0 : d + 1;
    check('erickson lemma 4.1 □^aTF□^b', `□${a}TF□${b}`, val(E(a) + 'TF' + E(b)) === numberGame(want41), nm(val(E(a) + 'TF' + E(b))));
    check('erickson lemma 4.1 □^aTF□^b', `□${a}TF□${b} = {b−a−2|b−a+2}`, val(E(a) + 'TF' + E(b)) === make([numberGame(d - 2)], [numberGame(d + 2)]), nm(val(E(a) + 'TF' + E(b))));
    // Lemma 4.2
    const want42 = 2 * a <= b ? b - 1 : a < b ? 2 * (b - a) - 1 : a === b ? 0 : a <= 2 * b ? 2 * (b - a) + 1 : 1 - a;
    const g42 = val(E(a) + 'TFTF' + E(b));
    check('erickson lemma 4.2 □^aTFTF□^b', `□${a}TFTF□${b}`, g42 === numberGame(want42), nm(g42));
    // Lemma 4.3
    const want43 = a <= b - 1 ? 2 * b - a - 2 : a <= b + 1 ? b - 1 : a <= 2 * b ? 2 * b - a : 0;
    const g43 = val(E(a) + 'TTF' + E(b));
    check('erickson lemma 4.3 □^aTTF□^b', `□${a}TTF□${b}`, g43 === numberGame(want43), nm(g43));
    // Lemma 4.4 (b ≥ 2 toads, c empties)
    for (let tb = 2; tb <= 4; tb++) {
      const g44 = val(E(a) + 'T'.repeat(tb) + 'F' + E(b));
      check('erickson lemma 4.4 □^aT^bF□^c', `□${a}T${tb}F□${b}`, g44 === add(numberGame((tb - 2) * (b - 1)), g43), nm(g44));
    }
    // Theorem 5.2: T^a □^b F
    const g52 = val(start(a, b, 1));
    const want52 = b === 1 ? t(`{{${a - 2}|1}|0}`) : b % 2 ? add(numberGame((a - 1) * (b - 1)), STAR) : numberGame((a - 1) * (b - 1));
    check('erickson theorem 5.2 T^a□^bF', `T${a}□${b}F`, g52 === want52, nm(g52));
  }
  for (let m = 0; m <= 4; m++) for (let n = 0; n <= 5; n++) {
    const g = val('TF'.repeat(m) + 'T.' + 'TF'.repeat(n));
    check('erickson theorem 3.1 (TF)^mT□(TF)^n = 2^−n', `m=${m} n=${n}`, g === numberGame(2 ** -n), nm(g));
  }
  for (let n = 0; n <= 3; n++) for (let k = 0; k <= 2; k++) {
    const g = val(('T.' + 'TF'.repeat(n) + 'TTFF').repeat(2 * k + 1));
    check('erickson corollary 3.2 (T□(TF)^nTTFF)^(2k+1)', `n=${n} k=${k}`, g === numberGame((2 * k + 1) / 2 ** n), nm(g));
  }
  for (let n = 0; n <= 14; n++) {
    const g = val('TF.F' + E(n + 3));
    check('erickson theorem 3.3 TF□F□^(n+3) = {n|0}', `n=${n}`, g === make([numberGame(n)], [ZERO]), nm(g));
  }
  const thm35: object[] = [];
  for (let n = 0; n <= 16; n++) {
    const g = val('T.TF.F' + E(n));
    const th = thermograph(g);
    thm35.push({ n, value: name(g), temperature: th.temperature, mean: th.mean });
    if (n >= 6) check('erickson theorem 3.5 T□TF□F□^n = {n+1/2|1} (printed "{a+1/2|1}")', `n=${n}`, g === make([numberGame(n + 0.5)], [numberGame(1)]), nm(g));
  }
  for (let a = 0; a <= 12; a++) {
    const g = val('TF.F.F' + E(a));
    check('erickson theorem 7.7 TF□F□F□^a = {{a−6|−1}|−2}', `a=${a}`, g === t(`{{${a - 6}|-1}|-2}`), nm(g));
  }
  for (let n = 2; n <= 12; n++) {
    const g = val('T'.repeat(n) + '.F.F');
    check('erickson lemma 6.3 T^n□F□F = 0', `n=${n}`, g === ZERO, nm(g));
  }
  // Conjecture 7.1 = Thanatipanonda's theorem: T^a □□ F^b = {{a−3|a−b}|{*|3−b}}, a > b ≥ 2
  for (let a = 3; a <= 11; a++) for (let b = 2; b < a && a + b <= 13; b++) {
    const g = val(start(a, 2, b));
    check('erickson conj 7.1 / thanatipanonda thm: T^a□□F^b', `T${a}□□F${b}`, g === t(`{{${a - 3}|${a - b}}|{*|${3 - b}}}`), nm(g));
  }
  for (let a = 2; a <= 12; a++) {
    const g = val(start(a, 3, 2));
    check('erickson conj 7.2: T^a□□□FF = (a−2)*', `T${a}□3F2`, g === add(numberGame(a - 2), STAR), nm(g));
  }
  for (let a = 5; a <= 11; a++) {
    const g = val(start(a, 3, 3));
    check('erickson conj 7.3 / thanatipanonda thm: T^a□□□F^3 = a − 7/2', `T${a}□3F3`, g === numberGame(a - 3.5), nm(g));
  }
  for (let a = 4; a <= 7; a++) for (let b = 4; b <= 7 && a + b <= 12; b++) {
    const g = val(start(a, 3, b));
    check('thanatipanonda thm: T^a□□□F^b = {a−b|a−b}', `T${a}□3F${b}`, g === add(numberGame(a - b), STAR), nm(g));
  }
  const conj74: object[] = [];
  for (let a = 1; a <= 6; a++) {
    const g = val(start(a, a, a - 1));
    conj74.push({ a, value: name(g) });
    check('erickson conj 7.4: T^a□^aF^(a−1) = 1 or 1*', `T${a}□${a}F${a - 1}`, g === numberGame(1) || g === add(numberGame(1), STAR), nm(g));
  }
  // Thanatipanonda conjecture 1 (one frog, empties on both sides)
  for (let a = 1; a <= 6; a++) for (let b = 0; b <= 6; b++) for (let R = 0; R <= 4; R++) {
    const g = val(E(R) + 'T'.repeat(a) + E(b) + 'F' + E(R));
    const base = (a - 1) * (b - 1 + R);
    if (b === 0 && R === 0) continue; // T^aF: no moves for anyone
    const want = R === 0 && b === 1 ? t(`{{${a - 2}|1}|0}`) : b % 2 === 0 ? numberGame(base) : add(numberGame(base), STAR);
    if (b >= 1 || R >= 1) check('thanatipanonda conj 1.1: □^RT^a□^bF□^R', `R=${R} a=${a} b=${b}`, g === want, nm(g));
    if (R >= 1) {
      const g2 = val(E(R - 1) + 'T'.repeat(a) + E(b) + 'F' + E(R));
      const want2 = b % 2 === 0 ? numberGame(base) : numberGame(base + 0.5);
      check('thanatipanonda conj 1.2: □^(R−1)T^a□^bF□^R', `R=${R} a=${a} b=${b}`, g2 === want2, nm(g2));
    }
    for (let L = 0; R - L >= 2; L++) {
      const g3 = val(E(L) + 'T'.repeat(a) + E(b) + 'F' + E(R));
      check('thanatipanonda conj 1.3: □^LT^a□^bF□^R', `L=${L} R=${R} a=${a} b=${b}`, g3 === numberGame(R - L - 1 + base), nm(g3));
    }
  }
  // Thanatipanonda conjectures 3 and 4 on what we can reach here
  for (let a = 1; a <= 6; a++) for (let b = 1; 2 * a + b <= 14; b++) {
    const g = val(start(a, b, a));
    if (a > b && b !== 2) check('thanatipanonda conj 3: T^a□^bF^a = * (a > b, b ≠ 2)', `T${a}□${b}F${a}`, g === STAR, nm(g));
    if (b >= a) check('thanatipanonda conj 4: T^a□^bF^a ∈ {0, *} (b ≥ a)', `T${a}□${b}F${a}`, g === ZERO || g === STAR, nm(g));
    if (!(a === 3 && b === 2)) check('erickson conj 7.5: T^a□^bF^a infinitesimal', `T${a}□${b}F${a}`, isInfinitesimal(g), nm(g));
  }

  // Where the two papers disagree, settle it without game values: play the board
  // minus the published game (given by its options) and see whether the second
  // player wins both ways, by plain search.
  const disputes: object[] = [];
  for (const [board, pubs] of [['TTTTT....FFF', ['{{3*|5/2}|2}', '{{5/2|2}|2}']]] as [string, string[]][]) {
    for (const p of pubs) {
      const eq = differenceIsZero(board, parseGame(p));
      disputes.push({ board: compact(board), published: p, equal: eq });
      check('disputed cell, by plain search on board − published', `${compact(board)} − ${p} = 0`, eq === (val(board) === parseGame(p)), () => String(eq));
    }
  }

  const failed = Object.values(checks).reduce((s, c) => s + c.failed.length, 0);
  const total = Object.values(checks).reduce((s, c) => s + c.checked, 0);
  save({ total, failed, checks, disputes, thm35, conj74, pieceStates: v.size, games: gameCount() });
}

/**
 * board − H = 0, by searching the sum: Left moves a toad or moves in −H (to the
 * negative of a Right option of H), Right likewise. H is only used through its
 * option lists, never compared.
 */
function differenceIsZero(board: string, h: GameId): boolean {
  const memo = new Map<string, boolean>();
  const { leftOptions, rightOptions } = cgtOptions;
  // wins(b, x, left): the player to move wins board b + (−x)
  const wins = (b: string, x: GameId, left: boolean): boolean => {
    const key = `${left ? 'L' : 'R'}${b}|${x}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let r = false;
    for (const m of moves(b, left)) if (!wins(m.after, x, !left)) { r = true; break; }
    // a Left move in −x is −(a Right option of x)
    if (!r) for (const o of left ? rightOptions(x) : leftOptions(x)) if (!wins(b, o, !left)) { r = true; break; }
    memo.set(key, r);
    return r;
  };
  return !wins(board, h, true) && !wins(board, h, false);
}

// ---------------------------------------------------------------------------

function symmetric(a: number, bMax: number) {
  const cells: object[] = [];
  for (let b = 1; b <= bMax; b++) {
    const v = new Valuer();
    const s = Date.now();
    const g = v.value(start(a, b, a));
    const nmg = name(g);
    const th = thermograph(g);
    const row = THANA_SYM[a - 1]?.[b - 1] ?? '';
    cells.push({
      a, b, value: nmg.length > 300 ? `${nmg.slice(0, 300)}… (${nmg.length} chars)` : nmg,
      zero: g === ZERO, star: g === STAR, infinitesimal: isInfinitesimal(g), temperature: th.temperature,
      published: row, agrees: matches(g, row), states: v.size, ms: Date.now() - s,
    });
    console.log(JSON.stringify(cells[cells.length - 1]));
    save({ cells, games: gameCount() }, true);
  }
  save({ cells, games: gameCount() });
}

function family(k: number, aMax: number, bMax: number, maxLen = Infinity) {
  const cells: object[] = [];
  for (let a = 1; a <= aMax; a++) for (let b = 1; b <= bMax; b++) {
    if (2 * a + k + b > maxLen) continue;
    const v = new Valuer();
    const s = Date.now();
    const g = v.value(start(a + k, b, a));
    const nmg = name(g);
    const th = thermograph(g);
    const pub = b >= 3 ? THANA_FAMILY[k]?.[a - 1]?.[b - 3] ?? '' : '';
    cells.push({
      a: a + k, b, c: a, value: nmg.length > 300 ? `${nmg.slice(0, 300)}… (${nmg.length} chars)` : nmg,
      mean: th.mean, temperature: th.temperature, published: pub, agrees: matches(g, pub), states: v.size, ms: Date.now() - s,
    });
    console.log(JSON.stringify(cells[cells.length - 1]));
    save({ cells, games: gameCount() }, true);
  }
  save({ cells, games: gameCount() });
}

// ---------------------------------------------------------------------------

function thermo(count: number, maxLen: number) {
  const v = new Valuer();
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  const randomBoard = () => {
    const n = 3 + Math.floor(rnd() * (maxLen - 2));
    let b = '';
    for (let i = 0; i < n; i++) b += '.TF'[Math.floor(rnd() * 3)];
    return b;
  };
  let meanBad = 0, tempBad = 0, hotPairs = 0, sumBad = 0;
  const examples: string[] = [];
  // half the pairs are drawn among hot boards only (most random boards are numbers)
  const hotBoard = () => {
    for (;;) {
      const b = randomBoard();
      if (thermograph(v.value(b)).temperature > 0) return b;
    }
  };
  for (let i = 0; i < count; i++) {
    const x = i % 2 ? hotBoard() : randomBoard();
    const y = i % 2 ? hotBoard() : randomBoard();
    const g = v.value(x);
    const h = v.value(y);
    const s = add(g, h);
    // the sum as one board: the two strips joined by a dead wall TTFF
    if (v.value(x + 'TTFF' + y) !== s) sumBad++;
    const tg = thermograph(g), th = thermograph(h), ts = thermograph(s);
    if (tg.temperature > 0 && th.temperature > 0) hotPairs++;
    if (ts.mean !== tg.mean + th.mean) { meanBad++; if (examples.length < 5) examples.push(`mean ${x} + ${y}`); }
    if (!isNumber(s) && ts.temperature > Math.max(tg.temperature, th.temperature)) {
      tempBad++;
      if (examples.length < 5) examples.push(`temp ${x} + ${y}`);
    }
  }
  // known thermographs
  const known: [string, number, number][] = [
    ['±1', 0, 1], ['{3|1}', 2, 1], ['±1/8', 0, 1 / 8], ['{1|{1/2|0}}', 5 / 8, 3 / 8], ['^', 0, 0], ['*', 0, 0],
    ['{{2|1}|0}', 3 / 4, 3 / 4], ['{2|{1|0}}', 5 / 4, 3 / 4],
  ];
  const knownBad = known.filter(([s, m, T]) => {
    const th = thermograph(parseGame(s));
    return th.mean !== m || th.temperature !== T;
  }).map(([s]) => s);
  save({ count, maxLen, hotPairs, meanBad, tempBad, sumBad, knownBad, examples, pieceStates: v.size });
}

// keep imports used
void UP; void DOWN; void nimber; void parseBoard; void fmt;

switch (exp) {
  case 'boards': boards(Number(args[0] ?? 10)); break;
  case 'literature': literature(); break;
  case 'symmetric': symmetric(Number(args[0]), Number(args[1])); break;
  case 'family': family(Number(args[0]), Number(args[1]), Number(args[2]), Number(args[3] ?? Infinity)); break;
  case 'thermo': thermo(Number(args[0] ?? 1000), Number(args[1] ?? 10)); break;
  default: console.error('usage: node tools/verify.mts boards|literature|symmetric|family|thermo …'); process.exit(1);
}
