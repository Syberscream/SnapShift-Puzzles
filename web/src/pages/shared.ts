import { api, type Category, type PuzzleView } from '../lib/api';
import { me, setPoints } from '../lib/shell';
import { bg, errorText, h, medalBadge, modal, plusTag, timeUntil, toast } from '../lib/ui';

/** A small ring showing how much of a category you've finished. */
function progressRing(done: number, total: number): HTMLElement {
  const r = 15;
  const len = 2 * Math.PI * r;
  const k = total ? Math.min(1, done / total) : 0;
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 40 40');
  ring.setAttribute('class', 'ring');
  ring.innerHTML =
    `<circle cx="20" cy="20" r="${r}" class="ring-bg"/>` +
    `<circle cx="20" cy="20" r="${r}" class="ring-fg" stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - k)}" transform="rotate(-90 20 20)"/>`;
  return h('span', { class: 'progress-ring', title: `${done} of ${total} finished`, 'aria-label': `${done} of ${total} finished` }, ring, h('span', {}, `${done}/${total}`));
}

/** Category card used on the home and categories pages. */
export function categoryCard(c: Category, showProgress: boolean): HTMLElement {
  const done = c.done ?? 0;
  const collected = c.count >= 3 && done >= c.count;
  return h(
    'a',
    { class: `card category-card${collected ? ' collected' : ''}`, href: `/category?c=${c.id}` },
    h('div', { class: 'thumb', style: bg(c.tile) }),
    h('span', { class: 'pill count' }, `${c.count} puzzle${c.count === 1 ? '' : 's'}`),
    c.membersOnly ? h('span', { class: 'corner' }, plusTag('MEMBERS')) : null,
    h(
      'div',
      { class: 'meta' },
      h('div', { class: 'spread' }, h('b', {}, c.name), collected ? h('span', { class: 'collected-tag' }, '📚 Collected') : showProgress && c.count ? progressRing(done, c.count) : null),
      h('span', { class: 'muted small' }, c.description),
    ),
  );
}

/** Puzzle card used on the home and category pages. */
export function puzzleCard(p: PuzzleView, onChange?: () => void): HTMLElement {
  // Pictures in a live event open the event game, so playing them counts there.
  const href = `/play?p=${encodeURIComponent(p.slug)}${p.eventId ? `&event=${encodeURIComponent(p.eventId)}` : ''}`;
  if (p.unlocked) {
    return h(
      'a',
      { class: 'card', href },
      h('div', { class: 'thumb', style: bg(p.thumb) }),
      p.bestMedal ? h('span', { class: 'corner' }, medalBadge(p.bestMedal, true)) : null,
      p.inEvent ? h('span', { class: 'corner left event-tag' }, '🎉 EVENT') : null,
      h(
        'div',
        { class: 'meta' },
        h('b', {}, p.title),
        h('div', { class: 'spread' }, h('span', {}, `#${p.index + 1}`), h('span', {}, p.inProgress ? 'Continue →' : p.finished ? '✓ Done' : 'Play →')),
      ),
    );
  }
  return h(
    'button',
    { class: 'card', style: 'text-align:left;cursor:pointer;font:inherit', onclick: () => unlockDialog(p, onChange) },
    h('div', { class: 'thumb locked', style: bg(p.thumb) }),
    p.lock === 'points' || p.lock === 'event'
      ? h('span', { class: 'corner lock-badge', 'aria-hidden': 'true' }, p.lock === 'event' ? '⏳' : '🔒')
      : h('span', { class: 'corner' }, plusTag(p.lock === 'early' ? 'EARLY ACCESS' : 'PLUS')),
    h(
      'div',
      { class: 'meta' },
      h('b', {}, p.title),
      h(
        'div',
        { class: 'spread' },
        h('span', {}, `#${p.index + 1}`),
        h('span', {}, p.lock === 'event' ? 'When the event is on' : p.lock === 'members' ? 'Members only' : p.lock === 'early' && p.publicAt ? `Free ${timeUntil(p.publicAt)}` : `Unlock · ${p.unlockCost} pts`),
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
  if (p.lock === 'event') {
    const d = modal(h('h2', {}, `“${p.title}” is an event picture`), h('p', { class: 'muted' }, 'It opens to everyone while its event is on.'), h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => d.close() }, 'OK')));
    return;
  }
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

/** Puzzles per page in long lists (categories, events). */
export const PER_PAGE = 20;

/**
 * Page buttons: ‹ Prev · 1 … 4 5 6 … 12 · Next ›, plus "21–40 of 312".
 * `go` gets the new page number (1-based).
 */
export function pager(page: number, total: number, go: (p: number) => void, per = PER_PAGE): HTMLElement | null {
  const pages = Math.ceil(total / per);
  if (pages <= 1) return null;
  const btn = (label: string, p: number, opts: { current?: boolean; disabled?: boolean; aria?: string } = {}) =>
    h(
      'button',
      {
        class: `btn small page-btn${opts.current ? ' current' : ''}`,
        disabled: opts.disabled || opts.current ? true : undefined,
        'aria-current': opts.current ? 'page' : undefined,
        'aria-label': opts.aria,
        onclick: () => go(p),
      },
      label,
    );
  // Always the first and last page, and the two either side of this one.
  const shown = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const nums: HTMLElement[] = [];
  shown.forEach((p, i) => {
    if (i && p - shown[i - 1] > 1) nums.push(h('span', { class: 'page-gap', 'aria-hidden': 'true' }, '…'));
    nums.push(btn(String(p), p, { current: p === page, aria: `Page ${p}` }));
  });
  const from = (page - 1) * per + 1;
  const to = Math.min(total, page * per);
  return h(
    'nav',
    { class: 'pager', 'aria-label': 'Pages' },
    btn('‹ Prev', page - 1, { disabled: page <= 1, aria: 'Previous page' }),
    h('span', { class: 'page-nums' }, nums),
    btn('Next ›', page + 1, { disabled: page >= pages, aria: 'Next page' }),
    h('span', { class: 'muted small page-count' }, `${from}–${to} of ${total}`),
  );
}
