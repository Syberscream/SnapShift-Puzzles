import { api, type PuzzleView } from '../lib/api';
import { me, setPoints } from '../lib/shell';
import { bg, errorText, h, medalBadge, modal, toast } from '../lib/ui';

/** Puzzle card used on the home and category pages. */
export function puzzleCard(p: PuzzleView, onChange?: () => void): HTMLElement {
  const href = `/play?p=${encodeURIComponent(p.slug)}`;
  if (p.unlocked) {
    return h(
      'a',
      { class: 'card', href },
      h('div', { class: 'thumb', style: bg(p.thumb) }),
      p.bestMedal ? h('span', { class: 'corner' }, medalBadge(p.bestMedal)) : null,
      h(
        'div',
        { class: 'meta' },
        h('b', {}, p.title),
        h('div', { class: 'spread' }, h('span', {}, `#${p.index + 1}`), h('span', {}, p.inProgress ? 'Continue →' : 'Play →')),
      ),
    );
  }
  return h(
    'button',
    { class: 'card', style: 'text-align:left;cursor:pointer;font:inherit', onclick: () => unlockDialog(p, onChange) },
    h('div', { class: 'thumb locked', style: bg(p.thumb) }),
    h('span', { class: 'corner lock-badge', 'aria-hidden': 'true' }, '🔒'),
    h(
      'div',
      { class: 'meta' },
      h('b', {}, p.title),
      h('div', { class: 'spread' }, h('span', {}, `#${p.index + 1}`), h('span', {}, `Unlock · ${p.unlockCost} pts`)),
    ),
  );
}

function unlockDialog(p: PuzzleView, onChange?: () => void) {
  const user = me();
  if (!user) {
    modal(
      h('h2', {}, `Unlock “${p.title}”`),
      h('p', { class: 'muted' }, `Sign in to unlock puzzles with points. This one costs ${p.unlockCost} points.`),
      h('div', { class: 'row end' }, h('a', { class: 'btn primary', href: `/account?next=${encodeURIComponent(location.pathname + location.search)}` }, 'Sign in')),
    );
    return;
  }
  const short = user.points < p.unlockCost;
  const err = h('p', { class: 'error' });
  const go = h('button', { class: 'btn primary', disabled: short }, `Unlock for ${p.unlockCost} pts`);
  const d = modal(
    h('h2', {}, `Unlock “${p.title}”`),
    h('div', { class: 'preview', style: bg(p.thumb) + ';aspect-ratio:1;filter:grayscale(.5)' }),
    h('p', { class: 'muted', style: 'margin-top:10px' }, `You have ${user.points.toLocaleString()} points.`, short ? ` You need ${p.unlockCost - user.points} more — finish puzzles and dailies to earn them.` : ''),
    err,
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => d.close() }, 'Cancel'), go),
  );
  go.addEventListener('click', async () => {
    go.setAttribute('disabled', '');
    try {
      const r = await api.post<{ points: number }>(`/puzzles/${encodeURIComponent(p.slug)}/unlock`);
      setPoints(r.points);
      toast('Unlocked!', p.title, 'good');
      d.close();
      onChange?.();
    } catch (e) {
      err.textContent = errorText(e);
      go.removeAttribute('disabled');
    }
  });
}
