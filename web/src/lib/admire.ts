// A moment to enjoy the finished picture before the results pop up. The results
// wait until the player taps, clicks or presses a key. Used by the website and the
// portal edition.

export function admire(): Promise<void> {
  return new Promise((resolve) => {
    const tip = document.createElement('div');
    tip.className = 'admire-tip';
    tip.textContent = 'Tap to continue';
    tip.setAttribute('role', 'status');
    tip.style.cssText =
      'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:60;padding:8px 18px;border-radius:999px;' +
      'background:rgba(10,14,28,.78);color:#fff;font:600 15px/1.2 system-ui,sans-serif;pointer-events:none;' +
      'backdrop-filter:blur(8px);opacity:0;transition:opacity .4s;animation:admire-pulse 2s ease-in-out infinite';
    if (!document.getElementById('admire-style')) {
      const st = document.createElement('style');
      st.id = 'admire-style';
      st.textContent = '@keyframes admire-pulse{50%{box-shadow:0 0 0 6px rgba(255,255,255,.12)}}';
      document.head.append(st);
    }
    document.body.append(tip);
    const show = setTimeout(() => (tip.style.opacity = '1'), 600);
    const started = performance.now();
    const skip = (e: Event) => {
      // Ignore the tap that finished the puzzle.
      if (performance.now() - started < 300) return;
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(show);
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
      tip.remove();
      resolve();
    };
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
  });
}
