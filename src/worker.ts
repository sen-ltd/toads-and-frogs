// Web Worker: the value of the board, its thermograph, the independent pieces
// it splits into, and the value after every move the player to move can make.
// One Valuer is kept for the whole session, so replies get faster as you play.
import { name, outcome, type Outcome } from './cgt.ts';
import { type Board, Valuer, moves, simplify, compact } from './toads.ts';
import { thermograph, type PL } from './thermo.ts';

export interface Request {
  id: number;
  board: Board;
  leftToMove: boolean;
}

export interface Reply {
  id: number;
  value: string;
  outcome: Outcome;
  mean: number;
  temperature: number;
  isNumber: boolean;
  left: PL;
  right: PL;
  leftScaffold: PL | null;
  rightScaffold: PL | null;
  /** the board after the simplification rules: integer + pieces */
  int: number;
  pieces: { board: string; value: string; temperature: number }[];
  /** every legal move for the player to move; `good` keeps the win */
  moves: { from: number; to: number; value: string; mean: number; good: boolean }[];
  states: number;
  ms: number;
}

const v = new Valuer();

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, board, leftToMove } = ev.data;
  const t0 = performance.now();
  const g = v.value(board);
  const th = thermograph(g);
  const simp = simplify(board);
  const pieces = simp.parts.map((p) => {
    const pv = v.value(p);
    return { board: compact(p), value: name(pv), temperature: thermograph(pv).temperature };
  });
  const ms = moves(board, leftToMove).map((m) => {
    const after = v.value(m.after);
    const o = outcome(after);
    // after the move the opponent moves first: we win if they lose moving first
    const good = leftToMove ? o === 'L' || o === 'P' : o === 'R' || o === 'P';
    return { from: m.from, to: m.to, value: name(after), mean: thermograph(after).mean, good };
  });
  const reply: Reply = {
    id, value: name(g), outcome: outcome(g), mean: th.mean, temperature: th.temperature,
    isNumber: th.leftScaffold === null, left: th.left, right: th.right,
    leftScaffold: th.leftScaffold, rightScaffold: th.rightScaffold,
    int: simp.int, pieces, moves: ms, states: v.size, ms: Math.round(performance.now() - t0),
  };
  (self as unknown as Worker).postMessage(reply);
};
