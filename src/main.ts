import './style.css';
import { type Board, moves, parseBoard, compact } from './toads.ts';
import { evalPL, type PL } from './thermo.ts';
import { formatNumber } from './cgt.ts';
import type { Request, Reply } from './worker.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = $<HTMLElement>('board') as unknown as SVGSVGElement;
const thermoSvg = $<HTMLElement>('thermo') as unknown as SVGSVGElement;
const statusEl = $('status');
const presetSel = $<HTMLSelectElement>('presetSel');
const youSel = $<HTMLSelectElement>('youSel');
const firstSel = $<HTMLSelectElement>('firstSel');
const hintsBox = $<HTMLInputElement>('hints');
const modeBtn = $<HTMLButtonElement>('mode');
const palette = $('palette');

const MAX_SQUARES = 24;

interface Preset { id: string; label: string; board: string }
const PRESETS: Preset[] = [
  { id: 'hot', label: 'T□TF□F□6 = {13/2 | 1}, hot', board: 'T.TF.F......' },
  { id: 'eighth', label: 'TTT□□FFF = ±1/8', board: 'TTT..FFF' },
  { id: 'star', label: 'TT□FF = *', board: 'TT.FF' },
  { id: 't4', label: 'TTTT□□FFFF, a long infinitesimal', board: 'TTTT..FFFF' },
  { id: 'switch', label: 'T5□4F2 = {6 | 11/2}', board: 'TTTTT....FF' },
  { id: 'frac', label: 'T4□5F2 = 95/16', board: 'TTTT.....FF' },
  { id: 'nasty', label: 'T7□4F3, Erickson\'s "nasty" value', board: 'TTTTTTT....FFF' },
  { id: 'thm77', label: 'TF□F□F□8 = {{2 | −1} | −2}', board: 'TF.F.F........' },
  { id: 'simp', label: 'TFTFF□FT□□TTFF□TFF□□TT = 1', board: 'TFTFF.FT..TTFF.TFF..TT' },
  { id: 'onefrog', label: 'TTT□F = {{1 | 1} | 0}', board: 'TTT.F' },
];

let initial: Board = PRESETS[0].board;
let board: Board = initial;
let leftToMove = true;
let history: { board: Board; leftToMove: boolean; from: number; to: number }[] = [];
let youLeft = true;
let editing = false;
let reply: Reply | null = null;
let requestId = 0;
let busy = false;
let worker = makeWorker();

function makeWorker(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (ev: MessageEvent<Reply>) => {
    if (ev.data.id !== requestId) return;
    busy = false;
    reply = ev.data;
    render();
    maybeCpu();
  };
  w.onerror = (ev) => {
    ev.preventDefault();
    busy = false;
    worker.terminate();
    worker = makeWorker();
    statusEl.textContent = `The position is too big to value here (${ev.message || 'worker error'}). Try a shorter strip.`;
  };
  return w;
}

const SIDE = (left: boolean) => (left ? 'Toads' : 'Frogs');

function newGame(): void {
  board = initial;
  leftToMove = firstSel.value === 'toads';
  history = [];
  analyse();
}

function analyse(): void {
  requestId++;
  reply = null;
  if (busy) { worker.terminate(); worker = makeWorker(); }
  if (editing) { busy = false; render(); return; }
  busy = true;
  const req: Request = { id: requestId, board, leftToMove };
  worker.postMessage(req);
  render();
}

const yourTurn = () => leftToMove === youLeft;
const gameOver = () => reply !== null && reply.moves.length === 0;

function play(from: number): void {
  const m = moves(board, leftToMove).find((x) => x.from === from);
  if (!m) return;
  history.push({ board, leftToMove, from: m.from, to: m.to });
  board = m.after;
  leftToMove = !leftToMove;
  analyse();
}

function maybeCpu(): void {
  if (!reply || editing || yourTurn() || gameOver()) return;
  // a winning move if there is one; among equals, the best mean for the mover
  const pool = reply.moves.some((m) => m.good) ? reply.moves.filter((m) => m.good) : reply.moves;
  const score = (m: Reply['moves'][number]) => (leftToMove ? m.mean : -m.mean);
  const best = Math.max(...pool.map(score));
  const top = pool.filter((m) => score(m) === best);
  const pick = top[Math.floor(Math.random() * top.length)].from;
  const id = requestId;
  setTimeout(() => { if (id === requestId) play(pick); }, 500);
}

// ---- the strip -------------------------------------------------------------------

const CELL = 52;
const PAD = 14;

function piece(kind: 'T' | 'F', x: number, y: number, cls: string): string {
  const r = 18;
  const dir = kind === 'T' ? 1 : -1;
  // a body, two eyes looking the way the piece moves
  const ex = x + dir * 6;
  return `<g class="pc ${kind === 'T' ? 'toad' : 'frog'} ${cls}">` +
    `<ellipse cx="${x}" cy="${y + 2}" rx="${r}" ry="${r - 3}" class="body"/>` +
    `<circle cx="${ex - 6}" cy="${y - 9}" r="5.2" class="eye"/><circle cx="${ex + 6}" cy="${y - 9}" r="5.2" class="eye"/>` +
    `<circle cx="${ex - 6 + dir * 1.6}" cy="${y - 9}" r="2.3" class="pupil"/><circle cx="${ex + 6 + dir * 1.6}" cy="${y - 9}" r="2.3" class="pupil"/>` +
    `<text x="${x}" y="${y + 9}" text-anchor="middle">${kind}</text></g>`;
}

function render(): void {
  const n = board.length;
  const W = PAD * 2 + n * CELL;
  const H = 128;
  const y0 = 46;
  svg.setAttribute('viewBox', `0 0 ${Math.max(W, 300)} ${H}`);
  const info = new Map((reply?.moves ?? []).map((m) => [m.from, m]));
  const showHints = hintsBox.checked && !editing && reply !== null && yourTurn();
  const last = history.length ? history[history.length - 1] : null;
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = PAD + i * CELL;
    const cls = ['cell'];
    if (last && (i === last.from || i === last.to)) cls.push('lastmove');
    s += `<rect class="${cls.join(' ')}" x="${x + 2}" y="${y0}" width="${CELL - 4}" height="${CELL - 4}" rx="7" data-sq="${i}"/>`;
    s += `<text class="idx" x="${x + CELL / 2}" y="${y0 + CELL + 14}" text-anchor="middle">${i + 1}</text>`;
  }
  for (let i = 0; i < n; i++) {
    const c = board[i];
    if (c === '.') continue;
    const x = PAD + i * CELL + CELL / 2;
    const mine = (c === 'T') === leftToMove;
    const open = !editing && yourTurn() && mine && info.has(i) && !gameOver();
    s += `<g data-sq="${i}" class="${open ? 'open' : ''}">${piece(c as 'T' | 'F', x, y0 + CELL / 2 - 2, open ? 'movable' : '')}</g>`;
    if (open) {
      const m = info.get(i)!;
      const tx = PAD + m.to * CELL + CELL / 2;
      s += `<path class="arrow" d="M${x},${y0 - 6} Q${(x + tx) / 2},${y0 - 22} ${tx},${y0 - 6}"/>`;
      if (showHints) {
        s += `<g class="mark ${m.good ? 'win' : 'lose'}"><circle cx="${x}" cy="${y0 - 22}" r="10"/>` +
          `<text x="${x}" y="${y0 - 17.5}" text-anchor="middle">${m.good ? '✓' : '✗'}</text>` +
          `<title>after this move: ${m.value}</title></g>`;
      }
    }
  }
  svg.innerHTML = s;
  renderStatus();
  renderValue();
  renderThermo();
  renderMoves();
}

function renderMoves(): void {
  const box = $('moves');
  if (editing || !reply || reply.moves.length === 0) { box.innerHTML = ''; return; }
  const who = leftToMove ? 'toad' : 'frog';
  const rows = reply.moves.map((m) => {
    const kind = Math.abs(m.to - m.from) === 2 ? 'jumps' : 'steps';
    return `<tr><td class="mv">${who} ${m.from + 1} ${kind} to ${m.to + 1}</td>` +
      `<td class="val">then G = ${m.value}</td>` +
      `<td class="ok ${m.good ? 'good' : 'bad'}">${m.good ? '✓ keeps the win' : '✗ loses'}</td></tr>`;
  }).join('');
  box.innerHTML = `<h3>${SIDE(leftToMove)}' moves from here</h3><div class="panel"><table>${rows}</table></div>`;
}

// ---- side panel -----------------------------------------------------------------

const OUTCOME_TEXT: Record<string, string> = {
  L: 'the Toads win, whoever moves first (G > 0)',
  R: 'the Frogs win, whoever moves first (G < 0)',
  P: 'the player to move loses (G = 0)',
  N: 'the player to move wins (G ‖ 0)',
};

const num = (x: number) => formatNumber(x);

function renderValue(): void {
  const box = $('value');
  if (editing) {
    box.innerHTML = `<div class="big dim">editing</div><p class="dim small">${board.length} / ${MAX_SQUARES} squares. Values come back when you press Play.</p>`;
    return;
  }
  if (!reply) {
    box.innerHTML = `<div class="big dim">…</div><p class="dim small">computing the value</p>`;
    return;
  }
  const temp = reply.isNumber
    ? `a number: nobody wants to move (temperature ${num(reply.temperature)})`
    : reply.temperature === 0
      ? `mean ${num(reply.mean)}, temperature 0: tepid, a number plus an infinitesimal`
      : `mean <b>${num(reply.mean)}</b>, temperature <b>${num(reply.temperature)}</b>: what a move here is worth`;
  const parts = reply.pieces.length + (reply.int !== 0 ? 1 : 0);
  box.innerHTML =
    `<div class="big${reply.value.length > 26 ? ' long' : ''}">G = ${reply.value}</div>` +
    `<p class="verdict">${OUTCOME_TEXT[reply.outcome]}</p>` +
    `<p class="small">${temp}</p>` +
    (parts > 1 || reply.int !== 0 || reply.pieces.length === 0 || reply.pieces[0].board !== compact(board)
      ? `<p class="dim small">after removing dead pieces, terminal toads and finished frogs:</p><ol class="pieces">` +
        (reply.int !== 0 ? `<li><span>${num(reply.int)}</span> <em>free moves</em></li>` : '') +
        reply.pieces.map((p) => `<li><span>${p.board}</span> <em>= ${p.value}</em></li>`).join('') +
        (reply.pieces.length === 0 && reply.int === 0 ? `<li><span>nothing left</span> <em>= 0</em></li>` : '') +
        `</ol>`
      : '') +
    `<p class="dim small">${reply.states.toLocaleString('en')} positions valued this session · ${reply.ms} ms</p>`;
}

/** Thermograph: value on the x axis with Left's side on the left, tax t going up. */
function renderThermo(): void {
  const W = 340, H = 220, padL = 18, padR = 18, padT = 16, padB = 30;
  if (!reply || editing) { thermoSvg.innerHTML = ''; return; }
  const T = Math.max(reply.temperature, 0);
  const top = reply.isNumber ? 1 : T === 0 ? 1 : T * 1.45;
  const sample = (f: PL, upTo: number) => {
    const ts = [...f.ts.filter((t) => t < upTo), upTo];
    return ts.map((t) => [t, evalPL(f, t)] as const);
  };
  const lw = reply.isNumber ? [[0, reply.mean] as const] : sample(reply.left, top);
  const rw = reply.isNumber ? [[0, reply.mean] as const] : sample(reply.right, top);
  const xs = [...lw, ...rw].map((p) => p[1]);
  let lo = Math.min(...xs), hi = Math.max(...xs);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const span = hi - lo;
  lo -= span * 0.08; hi += span * 0.08;
  // Left (positive) is drawn on the left, as in Winning Ways
  const X = (v: number) => padL + ((hi - v) / (hi - lo)) * (W - padL - padR);
  const Y = (t: number) => H - padB - (t / top) * (H - padT - padB);
  const path = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([t, v], i) => `${i ? 'L' : 'M'}${X(v).toFixed(1)},${Y(t).toFixed(1)}`).join(' ');
  let s = `<line class="axis" x1="${padL}" y1="${Y(0)}" x2="${W - padR}" y2="${Y(0)}"/>`;
  // integer ticks
  for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
    if ((hi - lo) > 16 && k % 4) continue;
    s += `<line class="tick" x1="${X(k)}" y1="${Y(0)}" x2="${X(k)}" y2="${Y(0) + 5}"/>` +
      `<text class="ticklabel" x="${X(k)}" y="${Y(0) + 18}" text-anchor="middle">${k}</text>`;
  }
  if (reply.isNumber) {
    s += `<line class="mast" x1="${X(reply.mean)}" y1="${Y(0)}" x2="${X(reply.mean)}" y2="${Y(top)}"/>`;
  } else {
    if (T > 0) s += `<line class="tline" x1="${padL}" y1="${Y(T)}" x2="${W - padR}" y2="${Y(T)}"/>` +
      `<text class="tlabel" x="${W - padR}" y="${Y(T) - 5}" text-anchor="end">t = ${num(T)}</text>`;
    s += `<path class="wall left" d="${path(lw)}"/><path class="wall right" d="${path(rw)}"/>`;
    s += `<line class="mast" x1="${X(reply.mean)}" y1="${Y(T)}" x2="${X(reply.mean)}" y2="${Y(top)}"/>`;
  }
  s += `<text class="tlabel" x="${X(reply.mean) + 6}" y="${padT + 10}">mean ${num(reply.mean)}</text>`;
  thermoSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  thermoSvg.innerHTML = s;
}

function renderStatus(): void {
  if (editing) {
    statusEl.innerHTML = 'Click a square to cycle empty → toad → frog. Use + / − to change the length, or type a position like <code>T3□2F3</code>.';
    return;
  }
  if (!reply) { statusEl.textContent = 'computing…'; return; }
  const who = SIDE(leftToMove);
  if (gameOver()) {
    const youWon = !yourTurn();
    statusEl.innerHTML = `The ${who} cannot move. ` +
      (youWon ? `<strong class="win-t">You win.</strong>` : `<strong class="lose-t">The computer wins.</strong>`);
    return;
  }
  const wins = reply.moves.filter((m) => m.good).length;
  const verdict = wins
    ? `<strong class="win-t">${who} to move win</strong> (${wins} winning move${wins > 1 ? 's' : ''})`
    : `<strong class="lose-t">${who} to move lose</strong> against best play`;
  const lead = yourTurn()
    ? `Your move (${who}): click a ${leftToMove ? 'toad' : 'frog'} to step or jump it ${leftToMove ? 'right' : 'left'}`
    : `Computer (${who}) to move`;
  statusEl.innerHTML = `${lead} · ${verdict}`;
}

// ---- input -----------------------------------------------------------------------

svg.addEventListener('click', (ev) => {
  const el = (ev.target as Element).closest('[data-sq]');
  if (!el) return;
  const i = Number(el.getAttribute('data-sq'));
  if (editing) {
    const next: Record<string, string> = { '.': 'T', T: 'F', F: '.' };
    board = board.slice(0, i) + next[board[i]] + board.slice(i + 1);
    render();
    syncText();
    return;
  }
  if (!reply || !yourTurn() || gameOver()) return;
  play(i);
});

function setEditing(on: boolean): void {
  editing = on;
  requestId++; // drops a pending reply and the computer's queued move
  modeBtn.textContent = on ? 'Play' : 'Edit';
  modeBtn.classList.toggle('primary', on);
  palette.hidden = !on;
  document.body.classList.toggle('editing', on);
  if (on) { board = initial; history = []; render(); syncText(); return; }
  initial = board;
  newGame();
}

const textIn = $<HTMLInputElement>('boardText');
const syncText = () => { textIn.value = compact(board); };
$('grow').addEventListener('click', () => { if (board.length < MAX_SQUARES) { board += '.'; render(); syncText(); } });
$('shrink').addEventListener('click', () => { if (board.length > 1) { board = board.slice(0, -1); render(); syncText(); } });
$('setText').addEventListener('click', () => {
  try {
    const b = parseBoard(textIn.value.trim());
    if (b.length < 1 || b.length > MAX_SQUARES) throw new Error('length');
    board = b;
    textIn.classList.remove('bad');
    render();
  } catch {
    textIn.classList.add('bad');
  }
});

for (const p of PRESETS) presetSel.add(new Option(p.label, p.id));
presetSel.addEventListener('change', () => {
  const p = PRESETS.find((x) => x.id === presetSel.value) ?? PRESETS[0];
  initial = p.board;
  board = p.board;
  setEditing(false);
});
youSel.addEventListener('change', () => { youLeft = youSel.value === 'toads'; newGame(); });
firstSel.addEventListener('change', newGame);
hintsBox.addEventListener('change', render);
modeBtn.addEventListener('click', () => setEditing(!editing));
$('restart').addEventListener('click', () => { if (editing) setEditing(false); else newGame(); });
$('undo').addEventListener('click', () => {
  if (editing) return;
  // back to your previous turn
  while (history.length) {
    const h = history.pop()!;
    board = h.board;
    leftToMove = h.leftToMove;
    if (leftToMove === youLeft) break;
  }
  analyse();
});

const params = new URLSearchParams(location.search);
const pre = PRESETS.find((x) => x.id === params.get('p'));
if (pre) { presetSel.value = pre.id; initial = pre.board; }
const custom = params.get('b');
if (custom) {
  try { const b = parseBoard(custom); if (b.length && b.length <= MAX_SQUARES) initial = b; } catch { /* keep the preset */ }
}
if (params.get('you') === 'frogs') { youSel.value = 'frogs'; youLeft = false; }
if (params.get('first') === 'frogs') firstSel.value = 'frogs';
if (params.get('hints') === '0') hintsBox.checked = false;
newGame();
