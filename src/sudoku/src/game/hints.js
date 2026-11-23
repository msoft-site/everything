/**
 * Hints, built on the same technique ladder that graded the puzzle.
 *
 * A hint here is a piece of reasoning, not an answer: it names the technique,
 * points at the cells it read, and says why the conclusion follows. The
 * generator only ships puzzles this ladder can finish, so there is always a
 * real next step to describe, so the hint never has to fall back on reading the
 * solution grid.
 *
 * One thing has to come first, though. A player with a wrong digit on the board
 * is in a position that no amount of correct logic can resolve, and telling
 * them about a naked single somewhere else would be actively misleading. So a
 * mistake is reported before anything else is looked for.
 */

import { CELLS, cellName } from '../engine/grid.js';
import { createAnalysis, nextStep } from '../engine/techniques.js';
import { mistakes } from './state.js';

/**
 * The position as the hint engine sees it: the candidates the board implies,
 * less everything earlier hints have already ruled out.
 *
 * Rebuilt from the board each time rather than kept incrementally, so undo,
 * redo and a restored save all land in a consistent position for free.
 */
export function analysisFor(game) {
  const analysis = createAnalysis(game.values);
  for (let i = 0; i < CELLS; i++) analysis.cands[i] &= ~game.eliminated[i];
  return analysis;
}

/**
 * What to tell the player next.
 *
 * @param {object} game
 * @returns {{kind: 'solved'|'mistake'|'step'|'stuck', message: string,
 *   focus?: number[], step?: object, cells?: number[]}}
 *   `step` carries the placement or eliminations to apply if the player asks
 *   for the move as well as the reason.
 */
export function nextHint(game) {
  const wrong = mistakes(game);
  if (wrong.size) {
    const cells = [...wrong].sort((a, b) => a - b);
    return {
      kind: 'mistake',
      cells,
      focus: cells,
      message:
        cells.length === 1
          ? `${cellName(cells[0])} 不能填 ${game.values[cells[0]]}。清除该格即可继续逻辑推理。`
          : `有 ${cells.length} 个单元格填入的数字不正确。请先清除它们再继续。`,
    };
  }

  const analysis = analysisFor(game);
  const step = nextStep(analysis);
  if (!step) {
    const empty = countEmpty(game);
    return empty === 0
      ? { kind: 'solved', message: '盘面已完成。' }
      : {
          kind: 'stuck',
          message: '当前没有明显的单步推理。尝试填写候选数标记以进一步观察。',
        };
  }

  return {
    kind: 'step',
    step,
    focus: step.focus,
    message: step.explain,
  };
}

const countEmpty = (game) => {
  let n = 0;
  for (let i = 0; i < game.values.length; i++) if (!game.values[i]) n++;
  return n;
};
