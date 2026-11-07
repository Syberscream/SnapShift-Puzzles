// "Add SnapShift to your home screen": offered once a player has finished a
// couple of games. Uses the browser's install prompt where there is one
// (Android, desktop Chrome/Edge) and short instructions on iPhone/iPad.

import { h, inAndroidApp, store } from './ui';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const finishes = store<number>('ss_finishes', 0);
const dismissed = store<number>('ss_install_dismissed', 0);
let deferred: InstallPromptEvent | null = null;

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Call when a game is finished. */
export function noteFinish(): void {
  finishes.set(finishes.get() + 1);
}

let playUrl = '';
const android = () => /Android/i.test(navigator.userAgent);

/** `play`: the Google Play listing, offered to Android visitors instead of installing the web app. */
export function setupInstall(play = ''): void {
  playUrl = play;
  if (inAndroidApp()) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => dismissed.set(Date.now() + 10 * 365 * 86400_000));
  if (standalone() || finishes.get() < 2 || Date.now() - dismissed.get() < 30 * 86400_000) return;
  if (document.body.classList.contains('game-page')) return; // never interrupt a game
  setTimeout(offer, 4000);
}

function offer(): void {
  const usePlay = !!playUrl && android();
  if (!usePlay && !deferred && !ios()) return; // this browser can't install
  const close = () => {
    dismissed.set(Date.now());
    card.remove();
  };
  const install = h('button', { class: 'btn primary' }, deferred ? 'Install' : 'Got it') as HTMLButtonElement;
  if (usePlay) install.textContent = 'Get it on Google Play';
  install.addEventListener('click', async () => {
    if (usePlay) {
      close();
      location.href = playUrl;
      return;
    }
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
    }
    close();
  });
  const card = h(
    'div',
    { class: 'install-card', role: 'dialog', 'aria-label': 'Add SnapShift to your home screen' },
    h('img', { src: '/icons/icon-192.png', alt: '', width: 48, height: 48 }),
    h(
      'div',
      { class: 'stack', style: 'gap:4px' },
      h('b', {}, 'Add SnapShift to your home screen'),
      usePlay
        ? h('span', { class: 'small muted' }, 'Get the free SnapShift app: one tap to today’s daily, with reminders.')
        : deferred
        ? h('span', { class: 'small muted' }, 'One tap to today’s daily, full screen, no browser bars.')
        : h('span', { class: 'small muted' }, 'Tap the Share button ', h('b', {}, '⬆︎'), ' in Safari, then “Add to Home Screen”.'),
      h('div', { class: 'row' }, install, h('button', { class: 'btn ghost', onclick: close }, 'Not now')),
    ),
  );
  document.body.append(card);
}
