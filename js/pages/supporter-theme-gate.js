(() => {
  const THEME_URL = '/theme.json';

  function withCacheBust(url, bust){
    const src = String(url || '').trim();
    if (!src) return '';
    return src + (src.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(String(bust || Date.now()));
  }

  async function applyThemeGate(){
    try{
      const bust = Date.now();
      const r = await fetch(THEME_URL + '?t=' + bust, { cache:'no-store' });
      if (!r.ok) throw new Error('theme.json missing');
      const t = await r.json();
      const enabled = (t.themeEnabled !== false);
      const alpha = Math.max(0, Math.min(1, Number(t.themeAlpha ?? 0.85)));
      const bg = String(t.backgroundImage ?? '').trim();
      const frogSrc = String(t.frogImage ?? '').trim();
      const body = document.body;
      body.classList.toggle('theme-on', enabled && !!bg);
      document.documentElement.style.setProperty('--themeAlpha', String(alpha));
      document.documentElement.style.setProperty('--bgUrl', bg ? ('url("' + withCacheBust(bg, bust) + '")') : 'none');

      const frog = document.getElementById('frogImg');
      const frogOn = enabled && !!frogSrc;
      body.classList.toggle('frog-on', frogOn);
      if (frog){
        if (frogOn){
          frog.src = withCacheBust(frogSrc, bust);
          frog.style.display = '';
        } else {
          frog.removeAttribute('src');
          frog.style.display = 'none';
        }
      }
    }catch(e){
      document.body.classList.remove('theme-on', 'frog-on');
      const frog = document.getElementById('frogImg');
      if (frog){ frog.removeAttribute('src'); frog.style.display = 'none'; }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyThemeGate, { once:true });
  } else {
    applyThemeGate();
  }
})();
