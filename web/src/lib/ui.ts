/** Tiny DOM helpers: no framework, just safe element building. */

type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error('Missing element ' + sel);
  return el as HTMLElement;
}

export function mount(root: HTMLElement, ...nodes: (Child | Child[])[]): void {
  root.replaceChildren();
  for (const n of nodes.flat()) if (n !== null && n !== undefined && n !== false) root.append(n instanceof Node ? n : String(n));
}

export function toast(title: string, body = '', kind: 'good' | 'bad' | '' = '', ms = 3200): void {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: `toast ${kind}` }, h('b', {}, title), body ? h('span', { class: 'muted small' }, body) : null);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(...content: (Child | Child[])[]): HTMLDialogElement {
  const close = h('button', { class: 'modal-close', type: 'button', 'aria-label': 'Close', title: 'Close' }, '×');
  const d = h('dialog', { class: 'modal' }, close, ...content);
  close.addEventListener('click', () => d.close());
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
  return d;
}

export function bg(url: string): string {
  return url ? `background-image:url("${url.replace(/"/g, '%22')}")` : '';
}

/** Has a paid (or admin-given) membership, as opposed to an admin's built-in perks. */
export function hasPaidPlus(u: { lifetime: boolean; memberUntil: number | null } | null | undefined): boolean {
  return !!u && (u.lifetime || (!!u.memberUntil && u.memberUntil > Date.now()));
}

/** The small "PLUS" tag shown next to members' names and on members' pictures. */
export function plusTag(text = 'PLUS'): HTMLElement {
  return h('span', { class: 'plus-tag', title: 'SnapShift Plus' }, '✦ ', text);
}

/** "in 5h" / "in 2 days" until a time. */
export function timeUntil(ms: number): string {
  const hrs = Math.max(1, Math.round((ms - Date.now()) / 3600_000));
  return hrs < 36 ? `in ${hrs}h` : `in ${Math.round(hrs / 24)} days`;
}

/** A medal coin. With `named`, it sits in a pill with the medal's name (used on picture cards). */
export function medalBadge(medal: string | null | undefined, named = false): HTMLElement | null {
  if (!medal) return null;
  const label = medal[0].toUpperCase() + medal.slice(1);
  const coin = h('span', { class: `medal ${medal}`, title: `${label} medal`, 'aria-label': `${label} medal`, role: 'img' }, '★');
  return named ? h('span', { class: `medal-tag ${medal}` }, coin, h('span', { 'aria-hidden': 'true' }, label)) : coin;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Live "next daily" countdown; reloads the page data when it hits zero. */
export function countdown(el: HTMLElement, msLeft: number, onZero?: () => void): void {
  const end = Date.now() + msLeft;
  const tick = () => {
    const left = end - Date.now();
    el.textContent = formatClock(left);
    if (left <= 0) {
      onZero?.();
      return;
    }
    setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  };
  tick();
}

export function qs(name: string): string {
  return new URLSearchParams(location.search).get(name) || '';
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function store<T>(key: string, fallback: T): { get(): T; set(v: T): void } {
  return {
    get() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
      } catch {
        return fallback;
      }
    },
    set(v: T) {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage unavailable */
      }
    },
  };
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}
