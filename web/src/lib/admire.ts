// A moment to enjoy the finished picture before the results pop up. Any tap,
// click or key ends it early. Used by the website and the portal edition.

export function admire(ms = 2600): Promise<void> {
  return new Promise((resolve) => {
    const tip = document.createElement('div');
    tip.textContent = 'Tap to continue';
    tip.setAttribute('role', 'status');
    tip.style.cssText =
      'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:60;padding:7px 16px;border-radius:999px;' +
      'background:rgba(10,14,28,.72);color:#fff;font:600 14px/1.2 system-ui,sans-serif;pointer-events:none;' +
      'backdrop-filter:blur(8px);opacity:0;transition:opacity .4s';
    document.body.append(tip);
    const show = setTimeout(() => (tip.style.opacity = '1'), 700);
    const started = performance.now();
    const done = () => {
      clearTimeout(show);
      clearTimeout(timer);
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
      tip.remove();
      resolve();
    };
    // Ignore the tap that finished the puzzle.
    const skip = () => performance.now() - started > 300 && done();
    const timer = setTimeout(done, ms);
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
  });
}
