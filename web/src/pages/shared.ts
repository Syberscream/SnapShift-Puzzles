import { api, type PuzzleView } from '../lib/api';
import { me, setPoints } from '../lib/shell';
import { bg, errorText, h, medalBadge, modal, plusTag, timeUntil, toast } from '../lib/ui';

/** Puzzle card used on the home and category pages. */
export function puzzleCard(p: PuzzleView, onChange?: () => void): HTMLElement {
  const href = `/play?p=${encodeURIComponent(p.slug)}`;
  if (p.unlocked) {
    return h(
      'a',
      { class: 'card', href },
      h('div', { class: 'thumb', style: bg(p.thumb) }),
      p.bestMedal ? h('span', { class: 'corner' }, medalBadge(p.bestMedal, true)) : null,
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
    p.lock === 'points' ? h('span', { class: 'corner lock-badge', 'aria-hidden': 'true' }, '🔒') : h('span', { class: 'corner' }, plusTag(p.lock === 'early' ? 'EARLY ACCESS' : 'PLUS')),
    h(
      'div',
      { class: 'meta' },
      h('b', {}, p.title),
      h(
        'div',
        { class: 'spread' },
        h('span', {}, `#${p.index + 1}`),
        h('span', {}, p.lock === 'members' ? 'Members only' : p.lock === 'early' && p.publicAt ? `Free ${timeUntil(p.publicAt)}` : `Unlock · ${p.unlockCost} pts`),
      ),
    ),
  );
}

/** Explain a members' picture and point to SnapShift Plus. */
export function plusDialog(title: string, text: string): void {
  const d = modal(
    h('h2', {}, title),
    h('p', { class: 'muted' }, text),
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => d.close() }, 'Not now'), h('a', { class: 'btn primary', href: '/plus' }, 'See SnapShift Plus')),
  );
}

function unlockDialog(p: PuzzleView, onChange?: () => void) {
  if (p.lock === 'members') return plusDialog(`“${p.title}” is in the Members’ Gallery`, 'SnapShift Plus members get a members-only gallery with new pictures every week, plus every puzzle unlocked.');
  if (p.lock === 'early' && p.publicAt)
    return plusDialog(`“${p.title}” is brand new`, `Plus members play new puzzles first. It opens to everyone ${timeUntil(p.publicAt)}.`);
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
    h('p', { class: 'small muted' }, 'Or ', h('a', { href: '/plus' }, 'get SnapShift Plus'), ' and every puzzle is unlocked.'),
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
