// Full screen that keeps phones sideways: entering locks landscape (where the
// browser allows), and the button always says what it will do.

type Lockable = ScreenOrientation & { lock?(o: string): Promise<void>; unlock?(): void };
const orientation = () => (screen.orientation as Lockable | undefined) ?? null;
const isPhone = () => window.matchMedia('(pointer: coarse) and (max-height: 600px), (pointer: coarse) and (max-width: 600px)').matches;

/** Go full screen on `el` (switching from another full-screen element if needed) and keep a phone sideways. */
export async function enterFullscreen(el: Element): Promise<void> {
  try {
    await el.requestFullscreen?.();
  } catch {
    return;
  }
  if (isPhone()) await orientation()?.lock?.('landscape').catch(() => {});
}

export async function exitFullscreen(): Promise<void> {
  try {
    orientation()?.unlock?.();
  } catch {
    /* ignore */
  }
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
}

/** A "Full screen" / "Exit full screen" button for `el`. */
export function fullscreenButton(el: () => Element, className = 'btn'): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = className;
  const label = () => (b.textContent = document.fullscreenElement && document.fullscreenElement === el() ? 'Exit full screen' : 'Full screen');
  b.addEventListener('click', () => void (document.fullscreenElement === el() ? exitFullscreen() : enterFullscreen(el())));
  document.addEventListener('fullscreenchange', label);
  label();
  return b;
}
