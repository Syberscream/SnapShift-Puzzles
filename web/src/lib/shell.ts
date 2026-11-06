import '../styles/site.css';
import { api, type Me } from './api';
import { h, toast } from './ui';

let current: Me | null = null;
let pointsPill: HTMLElement | null = null;
const listeners: ((u: Me | null) => void)[] = [];

export function me(): Me | null {
  return current;
}

export function onUser(fn: (u: Me | null) => void): void {
  listeners.push(fn);
}

export function setPoints(points: number): void {
  if (current) current.points = points;
  if (pointsPill) pointsPill.textContent = `Points: ${points.toLocaleString()}`;
}

function header(user: Me | null): HTMLElement {
  pointsPill = h('span', { class: 'pill', title: 'Your points balance' }, `Points: ${(user?.points ?? 0).toLocaleString()}`);
  const nav = h(
    'nav',
    { class: 'nav', id: 'site-nav', 'aria-label': 'Main' },
    user
      ? h('a', { class: 'btn', href: '/account' }, user.username)
      : h('a', { class: 'btn', href: '/account' }, 'Sign in'),
    h('a', { class: 'btn', href: '/' }, 'Home'),
    h('a', { class: 'btn', href: '/categories' }, 'Play'),
    h('a', { class: 'btn', href: '/daily' }, 'Daily'),
    h('a', { class: 'btn', href: '/leaderboard' }, 'Leaderboard'),
    user?.role === 'admin' ? h('a', { class: 'btn green', href: '/admin' }, 'Admin') : null,
    user ? pointsPill : null,
  );
  const toggle = h(
    'button',
    {
      class: 'btn menu-toggle',
      'aria-expanded': 'false',
      'aria-controls': 'site-nav',
      onclick: () => {
        const open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      },
    },
    'Menu',
  );
  return h(
    'header',
    { class: 'topbar' },
    h('a', { class: 'brand', href: '/', 'aria-label': 'SnapShift Puzzles home' }, h('img', { src: '/img/logo.png', alt: 'SnapShift Puzzles', width: 220, height: 68 })),
    toggle,
    nav,
  );
}

function footer(): HTMLElement {
  return h(
    'footer',
    { class: 'footer' },
    h(
      'nav',
      { 'aria-label': 'Footer' },
      h('a', { href: '/about' }, 'About'),
      h('a', { href: '/how-to-play' }, 'How to play'),
      h('a', { href: '/faq' }, 'FAQ'),
      h('a', { href: '/supporter' }, 'Supporter'),
      h('a', { href: '/contact' }, 'Contact'),
      h('a', { href: '/privacy' }, 'Privacy'),
      h('a', { href: '/terms' }, 'Terms'),
    ),
    h('p', { style: 'margin-top:8px' }, `© ${new Date().getFullYear()} SnapShift Puzzles`),
  );
}

/**
 * Build the page frame (header, main, footer) and load the signed-in user.
 * Returns the <main> element for the page to fill.
 */
export async function shell(opts: { title?: string; bodyClass?: string } = {}): Promise<HTMLElement> {
  if (opts.title) document.title = `${opts.title} | SnapShift Puzzles`;
  if (opts.bodyClass) document.body.classList.add(opts.bodyClass);
  try {
    current = (await api.get<{ user: Me | null }>('/auth/me')).user;
  } catch {
    current = null;
  }
  const existing = document.getElementById('app');
  const main = h('main', { id: 'main' });
  // Static pages ship their content inside #app; keep it.
  if (existing) main.append(...Array.from(existing.childNodes));
  const wrap = h('div', { class: 'shell' }, h('a', { class: 'sr-only', href: '#main' }, 'Skip to content'), header(current), main, footer());
  if (existing) existing.replaceWith(wrap);
  else document.body.prepend(wrap);
  listeners.forEach((fn) => fn(current));

  try {
    const site = await api.get<{ announcement: string }>('/site');
    if (site.announcement) main.prepend(h('div', { class: 'notice' }, site.announcement));
  } catch {
    /* optional */
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  return main;
}

export function requireSignIn(main: HTMLElement, what: string): boolean {
  if (current) return true;
  main.append(
    h(
      'section',
      { class: 'panel' },
      h('h1', {}, 'Sign in needed'),
      h('p', { class: 'muted' }, `Sign in to ${what}.`),
      h('a', { class: 'btn primary', href: `/account?next=${encodeURIComponent(location.pathname + location.search)}` }, 'Sign in or create an account'),
    ),
  );
  return false;
}

export function showError(main: HTMLElement, message: string): void {
  main.append(h('section', { class: 'panel' }, h('h1', {}, 'Something went wrong'), h('p', { class: 'error' }, message)));
  toast('Error', message, 'bad');
}
