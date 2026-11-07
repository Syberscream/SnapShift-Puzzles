// On a phone held upright, suggest turning it sideways: puzzle pictures are
// wide, so the board is much bigger in landscape. Goes away by itself when
// the phone is turned; "Keep playing upright" or "Don't ask again" close it.

import { h, store } from './ui';
import { enterFullscreen } from './fullscreen';

const never = store<boolean>('ss_rotate_never', false);
const portraitPhone = () =>
  window.matchMedia('(orientation: portrait) and (max-width: 600px) and (pointer: coarse)').matches;

let shown = false;

export function suggestLandscape(): void {
  if (shown || never.get() || !portraitPhone()) return;
  shown = true;
  const canLock = !!(screen.orientation && 'lock' in screen.orientation) && !!document.documentElement.requestFullscreen;
  const dont = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const close = () => {
    if (dont.checked) never.set(true);
    el.remove();
    mq.removeEventListener('change', onTurn);
  };
  const el = h(
    'div',
    { class: 'rotate-hint', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Turn your phone sideways' },
    h(
      'div',
      { class: 'rotate-card' },
      h('div', { class: 'rotate-phone', 'aria-hidden': 'true' }, h('i')),
      h('h2', {}, 'Turn your phone sideways'),
      h('p', { class: 'muted' }, 'The pictures are wide, so the puzzle is much bigger in landscape.'),
      canLock
        ? h(
            'button',
            {
              class: 'btn primary big',
              onclick: async () => {
                // Full screen on the board itself, so the game's "Full screen" button shows "Exit full screen".
                await enterFullscreen(document.querySelector('.board-wrap') ?? document.documentElement);
                close();
              },
            },
            'Turn it for me',
          )
        : null,
      h('button', { class: 'btn', onclick: close }, 'Keep playing upright'),
      h('label', { class: 'check small' }, dont, 'Don’t ask again'),
    ),
  );
  const mq = window.matchMedia('(orientation: landscape)');
  const onTurn = () => mq.matches && close();
  mq.addEventListener('change', onTurn);
  document.body.append(el);
}
