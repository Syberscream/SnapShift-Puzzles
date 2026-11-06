// Applies the admin-chosen look (background, transparency, colours) as CSS variables.
// The last theme is cached so the next page load paints with it straight away.

export interface Theme {
  backgroundImage: string;
  backgroundOpacity: number;
  backgroundFit: 'cover' | 'contain' | 'repeat';
  backgroundBlur: number;
  panelOpacity: number;
  baseColor: string;
  panelColor: string;
  pillColor: string;
  buttonColor: string;
  accentColor: string;
}

export interface Banner {
  id: string;
  image: string;
  href: string;
  alt: string;
  pages: string[];
  position: 'top' | 'bottom';
  enabled: boolean;
  /** "free" = an ad: hidden from SnapShift Plus members. */
  audience?: 'all' | 'free';
  start: string;
  end: string;
}

const CACHE = 'ss_theme';

export function applyTheme(t: Partial<Theme> | null | undefined, target: HTMLElement = document.documentElement): void {
  if (!t) return;
  const set = (k: string, v: string | undefined) => (v === undefined ? null : target.style.setProperty(k, v));
  set('--theme-bg-image', t.backgroundImage ? `url("${t.backgroundImage.replace(/"/g, '%22')}")` : t.backgroundImage === '' ? 'none' : undefined);
  set('--theme-bg-opacity', t.backgroundOpacity?.toString());
  if (t.backgroundFit) {
    set('--theme-bg-size', t.backgroundFit === 'repeat' ? 'auto' : t.backgroundFit);
    set('--theme-bg-repeat', t.backgroundFit === 'repeat' ? 'repeat' : 'no-repeat');
  }
  set('--theme-bg-blur', t.backgroundBlur !== undefined ? `${t.backgroundBlur}px` : undefined);
  set('--theme-panel-alpha', t.panelOpacity?.toString());
  set('--theme-base', t.baseColor);
  set('--theme-panel', t.panelColor);
  set('--pill', t.pillColor);
  set('--button', t.buttonColor);
  set('--accent', t.accentColor);
}

export function cacheTheme(t: Theme): void {
  try {
    localStorage.setItem(CACHE, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

// Paint with the last known theme immediately (before any network request).
try {
  const cached = localStorage.getItem(CACHE);
  if (cached) applyTheme(JSON.parse(cached));
} catch {
  /* ignore */
}

/** Which banner "page" the current URL is. */
export function pageKey(path = location.pathname): string {
  const p = path.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  if (p === '/' || p === '/index') return 'home';
  const name = p.slice(1);
  if (['categories', 'category', 'play', 'daily', 'leaderboard', 'account'].includes(name)) return name;
  return 'info';
}
