// First game: a small guided puzzle for new visitors. Nothing is saved on the
// server; it just shows how swapping and locking work, then points onward.

import { api } from '../lib/api';
import { me, shell, showError } from '../lib/shell';
import { errorText, h, mount, pickImage, store } from '../lib/ui';
import { Board } from '../game/board';
import { confetti } from '../game/confetti';
import { sfx } from '../game/sound';
import { noteFinish } from '../lib/install';
import { correctCount, isCorrect, isSolved, newGame, randomSeed, swap, type GameState } from '@shared/engine';
import { TIME_ATTACK_SETUP } from '@shared/rules';

const tutorialDone = store<boolean>('ss_tutorial_done', false);

const main = await shell({ title: 'Learn to play' });

let state: GameState;
let board: Board;
let idle = 0;
let step = 0;

const tip = h('div', { class: 'tutorial-tip', role: 'status', 'aria-live': 'polite' });
const canvas = h('canvas', { id: 'board' }) as HTMLCanvasElement;
const progressFill = h('i');

/** The next helpful swap: a wrong tile and the place it belongs. */
function nextPair(): [number, number] | null {
  for (let p = 0; p < state.tiles.length; p++) if (!isCorrect(state, p) && !state.locked[p]) return [p, state.tiles[p]];
  return null;
}

function say(title: string, text: string) {
  mount(tip, h('b', {}, title), h('span', {}, text));
}

function nudge(ms = 6000) {
  clearTimeout(idle);
  idle = window.setTimeout(() => {
    const pair = nextPair();
    if (pair && !isSolved(state)) board.showHint(pair, 5000);
  }, ms);
}

function onSwap(a: number, b: number) {
  if (isSolved(state)) return;
  const before = state.tiles.map((_, p) => isCorrect(state, p));
  const r = swap(state, a, b);
  if (!r.ok) return sfx.denied();
  board.animateSwap(a, b, [a, b].filter((p) => !before[p] && isCorrect(state, p)));
  if (r.newlyCorrect) sfx.correct(r.newlyCorrect);
  else sfx.swap();
  progressFill.style.width = `${(correctCount(state) / state.tiles.length) * 100}%`;
  if (isSolved(state)) return void finish();
  if (step === 0) {
    step = 1;
    say(
      r.newlyCorrect ? 'Nice!' : 'That’s a swap.',
      r.newlyCorrect
        ? ' A tile in its right place glows and locks, so you can’t move it by mistake. Now finish the picture. Stuck? Wait a moment for a hint.'
        : ' Tiles in their right place glow and lock. Try to put every tile where it belongs. Wait a moment for a hint.',
    );
  }
  nudge();
}

async function finish() {
  clearTimeout(idle);
  board.setCompleted(true);
  sfx.win('gold');
  tutorialDone.set(true);
  noteFinish();
  await board.celebrate();
  confetti('gold');
  const user = me();
  say('You’ve got it!', ' That’s all there is to it. Bigger boards, rotation mode and a new daily puzzle are waiting.');
  mount(
    next,
    h('a', { class: 'btn primary big', href: '/daily' }, 'Play today’s puzzle'),
    h('a', { class: 'btn', href: '/categories' }, 'Browse pictures'),
    h('a', { class: 'btn', href: '/time-attack' }, 'Try Time Attack'),
    user ? null : h('a', { class: 'btn', href: '/account' }, 'Create a free account'),
  );
}

const next = h('div', { class: 'row tutorial-next' });

try {
  const pic = await api.get<{ slug: string; title: string; image: string; imageSmall: string | null }>('/tutorial');
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('The picture did not load. Please refresh.'));
    i.src = pickImage(pic, true);
  });
  mount(
    main,
    h(
      'section',
      { class: 'panel tutorial' },
      h('h1', {}, 'Learn SnapShift in 30 seconds'),
      tip,
      h('div', { class: 'board-wrap' }, canvas),
      h('div', { class: 'progress-bar', role: 'progressbar', 'aria-label': 'Tiles in place' }, progressFill),
      next,
      h('p', { class: 'small muted' }, 'Using a keyboard? Arrow keys move, Enter picks up a tile and Enter again swaps it.'),
    ),
  );
  state = newGame(randomSeed(), TIME_ATTACK_SETUP);
  board = new Board(canvas, img, { showCorrect: true, onSwap, onRotate: () => {} });
  board.setState(state);
  const first = nextPair();
  say('The picture is jumbled.', ' Drag one glowing tile onto the other to swap them, or tap one and then the other.');
  if (first) board.showHint(first, 60_000);
  mount(next, h('a', { class: 'btn', href: '/' }, 'Skip'));
} catch (e) {
  showError(main, errorText(e));
}
