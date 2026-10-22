// Summarise runs/*.json as the markdown tables used in the README.
//   node tools/report.mts
import { readFileSync, readdirSync } from 'node:fs';

const runs = readdirSync('runs').filter((f) => f.endsWith('.json'));
const load = (f: string) => JSON.parse(readFileSync(`runs/${f}`, 'utf8'));
const n = (x: number) => x.toLocaleString('en');
const sec = (ms: number) => `${Math.round(ms / 1000)} s`;
const frac = (x: number) => {
  if (Number.isInteger(x)) return String(x);
  let d = 2;
  while (!Number.isInteger(x * d)) d *= 2;
  return `${x * d}/${d}`;
};

// every board up to n squares
for (const f of runs.filter((f) => f.startsWith('boards-'))) {
  const r = load(f);
  console.log(`\n### ${f} (${sec(r.ms)}), mismatches: ${r.mismatches}\n`);
  console.log('| squares | boards | distinct values | numbers | infinitesimals | hot (t > 0) | hottest | its value | temperature |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  let total = 0;
  for (const p of r.perLen) {
    total += p.boards;
    console.log(`| ${p.len} | ${n(p.boards)} | ${n(p.distinctValues)} | ${n(p.numbers)} | ${n(p.infinitesimals)} | ${n(p.hot)} | ${p.hottest} | ${p.hottestValue} | ${p.maxTemperature > 0 ? frac(p.maxTemperature) : '—'} |`);
  }
  console.log(`\ntotal boards: ${n(total)}`);
}

// literature
for (const f of runs.filter((f) => f.startsWith('literature'))) {
  const r = load(f);
  console.log(`\n### literature (${sec(r.ms)}): ${n(r.total)} checks, ${r.failed} failed\n`);
  console.log('| source | checked | agree |');
  console.log('|---|---|---|');
  for (const [k, c] of Object.entries(r.checks) as [string, { checked: number; failed: string[] }][]) {
    console.log(`| ${k} | ${c.checked} | ${c.checked - c.failed.length}${c.failed.length ? ` (${c.failed.join('; ')})` : ''} |`);
  }
  console.log('\ndisputes:', JSON.stringify(r.disputes));
  console.log('thm 3.5:', r.thm35.map((x: { n: number; value: string; temperature: number }) => `n=${x.n} ${x.value} t=${frac(x.temperature)}`).join(', '));
}

// T^a □^b F^a rows
const sym = runs.filter((f) => f.startsWith('symmetric-')).map(load).sort((a, b) => a.cells[0].a - b.cells[0].a);
if (sym.length) {
  console.log('\n### T^a □^b F^a\n');
  for (const r of sym) {
    const cells = r.cells as { a: number; b: number; value: string; published: string; agrees: boolean | null; ms: number; states: number }[];
    const a = cells[0].a;
    const shown = cells.map((c) => (c.value.length > 12 ? `[${c.value.length} chars]` : c.value)).join(' ');
    const checked = cells.filter((c) => c.agrees !== null);
    const bad = checked.filter((c) => !c.agrees).map((c) => `b=${c.b}: ${c.value} vs ${c.published}`);
    const nonzero = cells.filter((c) => c.value !== '0').map((c) => c.b);
    const last = cells[cells.length - 1];
    console.log(`a=${a}: b=1..${last.b} (${checked.length} published, ${bad.length} disagree${bad.length ? ': ' + bad.join('; ') : ''}); last cell ${sec(last.ms)}, ${n(last.states)} positions`);
    console.log(`  values: ${shown}`);
    console.log(`  b with value ≠ 0: ${nonzero.join(', ')}`);
  }
}

// T^(a+k) □^b F^a
for (const f of runs.filter((f) => f.startsWith('family-'))) {
  const r = load(f);
  const cells = r.cells as { a: number; b: number; c: number; value: string; published: string; agrees: boolean | null; mean: number; temperature: number }[];
  const checked = cells.filter((c) => c.agrees !== null);
  const bad = checked.filter((c) => !c.agrees);
  console.log(`\n### ${f} (${sec(r.ms)}): ${cells.length} cells, ${checked.length} published, ${bad.length} disagree`);
  for (const c of bad) console.log(`  T${c.a}□${c.b}F${c.c}: ${c.value} vs published ${c.published}`);
  // published inequalities, now with the exact value
  for (const c of checked.filter((c) => /[<|]/.test(c.published) && !c.published.startsWith('{')))
    console.log(`  T${c.a}□${c.b}F${c.c}: published "${c.published}", exact ${c.value.length > 60 ? `[${c.value.length} chars] mean ${frac(c.mean)} temp ${frac(c.temperature)}` : c.value}`);
  const hot = cells.filter((c) => c.temperature > 0).sort((x, y) => y.temperature - x.temperature).slice(0, 3);
  for (const c of hot) console.log(`  hot: T${c.a}□${c.b}F${c.c} temp ${frac(c.temperature)} mean ${frac(c.mean)} ${c.value.length > 60 ? `[${c.value.length} chars]` : c.value}`);
}

for (const f of runs.filter((f) => f.startsWith('thermo-'))) {
  const r = load(f);
  console.log(`\n### ${f} (${sec(r.ms)}): ${n(r.count)} random pairs, ${n(r.hotPairs)} with both hot; mean additive fails ${r.meanBad}, temp(G+H) > max fails ${r.tempBad}, joined board ≠ sum ${r.sumBad}, known thermographs wrong: ${r.knownBad.length}`);
}
