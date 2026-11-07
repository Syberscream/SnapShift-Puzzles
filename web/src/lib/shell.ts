import '../styles/site.css';
import { api, type Me } from './api';
import { h, hasPaidPlus, inAndroidApp, store, toast } from './ui';
import { setupInstall } from './install';
import { applyTheme, cacheTheme, pageKey, type Banner, type Theme } from './theme';

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
      ? h('a', { class: 'btn', href: '/account' }, hasPaidPlus(user) ? h('span', { class: 'plus-star', title: 'SnapShift Plus' }, '✦ ') : null, user.username)
      : h('a', { class: 'btn', href: '/account' }, 'Sign in'),
    h('a', { class: 'btn', href: '/' }, 'Home'),
    h('a', { class: 'btn', href: '/categories' }, 'Play'),
    h('a', { class: 'btn', href: '/daily' }, 'Daily'),
    h('a', { class: 'btn', href: '/time-attack' }, 'Time Attack'),
    h('a', { class: 'btn', href: '/slider' }, 'Slider'),
    h('a', { class: 'btn', href: '/leaderboard' }, 'Leaderboard'),
    !user?.member && !inAndroidApp() ? h('a', { class: 'btn plus-btn', href: '/plus' }, '✦ Get Plus') : null,
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
    h('a', { class: 'brand', href: '/', 'aria-label': 'SnapShift Puzzles home' }, logoImg()),
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
      h('a', { href: '/event' }, 'Events'),
      h('a', { href: '/plus' }, 'SnapShift Plus'),
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
  rememberInvite();
  if (opts.bodyClass) document.body.classList.add(opts.bodyClass);
  const sitePromise = api.get<SitePublic>('/site').catch(() => null);
  try {
    current = (await api.get<{ user: Me | null }>('/auth/me')).user;
  } catch {
    current = null;
  }
  const existing = document.getElementById('app');
  const main = h('main', { id: 'main' });
  // Static pages ship their content inside #app; keep it.
  if (existing) main.append(...Array.from(existing.childNodes));
  // Banners and the announcement live outside <main>, so pages can redraw main freely.
  const top = h('div', { class: 'banner-slot top' });
  const bottom = h('div', { class: 'banner-slot bottom' });
  const wrap = h('div', { class: 'shell' }, h('a', { class: 'sr-only', href: '#main' }, 'Skip to content'), header(current), top, main, bottom, footer());
  if (existing) existing.replaceWith(wrap);
  else document.body.prepend(wrap);
  listeners.forEach((fn) => fn(current));

  const site = await sitePromise;
  if (site) {
    applyTheme(site.theme);
    cacheTheme(site.theme);
    if (site.analyticsToken && !document.querySelector('script[data-cf-beacon]')) {
      const s = document.createElement('script');
      s.defer = true;
      s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
      s.dataset.cfBeacon = JSON.stringify({ token: site.analyticsToken });
      document.head.append(s);
    }
    if (site.announcement) top.append(h('div', { class: 'notice' }, site.announcement));
    for (const [slot, position] of [[top, 'top'], [bottom, 'bottom']] as const) {
      const b = pickBanner(site.banners, position);
      if (b) slot.append(bannerEl(b, position));
    }
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  setupInstall(site?.androidPlayUrl ?? '');
  return main;
}

/** Invites last 30 days: long enough to come back and sign up later. */
const INVITE_DAYS = 30;
export const inviteStore = store<{ name: string; at: number } | null>('ss_ref', null);

/** The friend who invited this visitor, if any (and not expired). */
export function invitedBy(): string | null {
  const v = inviteStore.get();
  return v && Date.now() - v.at < INVITE_DAYS * 864e5 ? v.name : null;
}

/** A visit through /?ref=name: keep the name, tidy the address bar and say hello once. */
function rememberInvite() {
  const params = new URLSearchParams(location.search);
  const ref = params.get('ref');
  if (!ref) return;
  params.delete('ref');
  history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
  if (!/^[A-Za-z0-9_]{3,20}$/.test(ref) || invitedBy() === ref) return;
  inviteStore.set({ name: ref, at: Date.now() });
  void api
    .get<{ username: string | null; points: number; finishes: number }>(`/invites/from/${encodeURIComponent(ref)}`)
    .then((r) => {
      if (!r.username) return inviteStore.set(null);
      if (current) return; // already a player
      toast(
        `${r.username} invited you to SnapShift!`,
        `Create a free account and you’ll both get ${r.points} points once you’ve finished ${r.finishes} puzzles.`,
        'good',
        9000,
      );
    })
    .catch(() => {});
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

interface SitePublic {
  announcement: string;
  analyticsToken?: string;
  androidPlayUrl?: string;
  theme: Theme;
  banners: Banner[];
}

/** One banner per slot: if several match this page and position, rotate at random. */
function pickBanner(banners: Banner[], position: 'top' | 'bottom'): Banner | null {
  const page = pageKey();
  if (page === 'play' && position === 'top') return null; // keep the board near the top
  const list = banners.filter((b) => b.position === position && (b.pages.includes('all') || b.pages.includes(page)));
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

/** Banner picture sizes seen before, so the space is kept while it loads (no layout shift). */
const bannerSizes = store<Record<string, [number, number]>>('ss_banner_sizes', {});

function bannerEl(b: Banner, position: string): HTMLElement {
  const known = bannerSizes.get()[b.image];
  const img = h('img', {
    src: b.image,
    alt: b.alt || 'SnapShift banner',
    loading: position === 'top' ? 'eager' : 'lazy',
    ...(known ? { width: known[0], height: known[1] } : {}),
  }) as HTMLImageElement;
  if (!known) {
    img.addEventListener('load', () => {
      const all = bannerSizes.get();
      all[b.image] = [img.naturalWidth, img.naturalHeight];
      // Keep the list short.
      bannerSizes.set(Object.fromEntries(Object.entries(all).slice(-20)));
    });
  }
  return b.href
    ? h('a', { class: 'banner', href: b.href, ...(b.href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {}) }, img)
    : h('div', { class: 'banner' }, img);
}

/** The header logo. If it fails to load (a dropped connection), try once more, then show the name. */
function logoImg(): HTMLElement {
  const img = h('img', { src: '/img/logo.png', alt: 'SnapShift Puzzles', width: 220, height: 68, fetchpriority: 'high' }) as HTMLImageElement;
  let tries = 0;
  img.addEventListener('error', () => {
    if (tries++ < 2) {
      setTimeout(() => (img.src = `/img/logo.png?r=${tries}`), 800 * tries);
      return;
    }
    img.replaceWith(h('span', { class: 'brand-text' }, 'Snap', h('b', {}, 'Shift'), ' Puzzles'));
  });
  return img;
}
