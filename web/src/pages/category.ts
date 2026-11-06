import { api, type Category, type PuzzleView } from '../lib/api';
import { shell, showError } from '../lib/shell';
import { bg, countdown, errorText, h, mount, plural, qs } from '../lib/ui';
import { puzzleCard } from './shared';

const main = await shell({ title: 'Puzzles' });
const id = qs('c');

if (/\/categories(\.html)?$/.test(location.pathname) || !id) {
  try {
    const { categories } = await api.get<{ categories: Category[] }>('/categories');
    mount(
      main,
      h('section', { class: 'panel' }, h('h1', {}, 'Browse categories'), h('p', { class: 'muted' }, 'Pick a theme. The first puzzle in every category is free; unlock more with points.')),
      h(
        'div',
        { class: 'grid' },
        categories.map((c) =>
          h(
            'a',
            { class: 'card category-card', href: `/category?c=${c.id}` },
            h('div', { class: 'thumb', style: bg(c.tile) }),
            h('span', { class: 'pill count' }, plural(c.count, 'puzzle')),
            h('div', { class: 'meta' }, h('b', {}, c.name), h('span', { class: 'muted small' }, c.description)),
          ),
        ),
      ),
    );
  } catch (e) {
    showError(main, errorText(e));
  }
} else {
  let filter: 'all' | 'unlocked' | 'locked' = 'all';
  const load = async () => {
    try {
      const d = await api.get<{ category: Category; puzzles: PuzzleView[]; unlockedCount: number; nextDailyInMs: number }>(
        `/categories/${encodeURIComponent(id)}`,
      );
      document.title = `${d.category.name} puzzles | SnapShift Puzzles`;
      const cd = h('span', { class: 'countdown' });
      const grid = h('div', { class: 'grid' });
      const draw = () => {
        const list = d.puzzles.filter((p) => (filter === 'all' ? true : filter === 'unlocked' ? p.unlocked : !p.unlocked));
        mount(grid, list.length ? list.map((p) => puzzleCard(p, load)) : h('p', { class: 'muted' }, 'Nothing here yet.'));
      };
      const filterBtn = (key: typeof filter, label: string) =>
        h(
          'button',
          {
            class: 'btn',
            'aria-pressed': String(filter === key),
            onclick: (ev: Event) => {
              filter = key;
              (ev.currentTarget as HTMLElement).parentElement!.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
              (ev.currentTarget as HTMLElement).setAttribute('aria-pressed', 'true');
              draw();
            },
          },
          label,
        );
      mount(
        main,
        h(
          'section',
          { class: 'panel' },
          h(
            'div',
            { class: 'spread' },
            h('div', {}, h('h1', {}, d.category.name), h('p', { class: 'muted' }, `${d.category.description} ${d.puzzles.length} puzzles.`)),
            h(
              'div',
              { class: 'row' },
              h('span', { class: 'pill' }, `Unlocked: ${d.unlockedCount} / ${d.puzzles.length}`),
              h('a', { class: 'pill', href: '/daily', style: 'text-decoration:none' }, h('span', { class: 'label' }, 'Next daily'), cd),
            ),
          ),
        ),
        h('div', { class: 'row', style: 'margin-bottom:12px' }, h('span', { class: 'muted small' }, 'Show'), filterBtn('all', 'All'), filterBtn('unlocked', 'Unlocked'), filterBtn('locked', 'Locked')),
        grid,
      );
      countdown(cd, d.nextDailyInMs);
      draw();
    } catch (e) {
      showError(main, errorText(e));
    }
  };
  await load();
}
